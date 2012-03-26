if (typeof (ELEMENT_NODE)==='undefined') {
    ELEMENT_NODE=1;
}

var MyWindow = {sameDoc: false, zIndex: 5001};
MyWindow.open = function(url, title, sameDoc) {
    var win, body, doc, setUrl, close, load;
    sameDoc = sameDoc || this.sameDoc;
    if (this.sameDoc) { //frame 
        if (url) {
            win = $("<iframe title='" + title + 
                    "' src='" + url + 
                    "' target='scraper'></iframe>");
        } else {
            win = $('<iframe title="'+title+'"></iframe>');
        }
        win.css({
		top:"10px",
                    width:"100%",
                    height:"400px", 
                    border: "3px solid black",
                    "background-color": "white",
                    "z-index": (this.zIndex++).toString()
                    });
        $("body").prepend(win);
        doc = function() {return win.contents();};
        close = function() {
            win.remove();
        };
        setUrl = function (newUrl) {
            url = newUrl;
            win.src = newUrl;
        };
    } else { //new window
        win = window.open(url);
        if (title) {win.document.title='title';}
        doc = function() {return $(win.document);};
        close = function() {
            win.close();
        };
        setUrl = function (newUrl)  {
            url = newUrl;
            win.location.href = newUrl;
        };
    }
    load = function(handler) {
        //let's make sure load is eventually called
        //even if load never fires
        if (url) {
            $(win).load(handler);
        } else {
            handler();
        }
    };


    return {
        title: title,
        document: doc,
        body: function () {return doc().find('body');},
        load: load,
        setUrl: setUrl,
        close: close
    };
};


//bind (once) to a click event
//but override any other click events
//returns a function that can be called to cancel the listener
var captureClick = function (cont) {
    //can't use jquery because it doesn't do events in capture phase
    //so it can't preventDefault soon enough to prevent following links
    var listener = function(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	document.removeEventListener('click', listener, true);
	setTimeout(function() {
		cont(evt.target);
	    }, 
	    10); //let this event handler finish 1st
	return(false);
    };
    document.addEventListener('click', listener, true);
    return function() {
	    document.removeEventListener('click', listener, true);
	};
};


//when called, lets user interactively choose a page element
//when done, invokes cont passing chosen element
var selectItem = function(cont) {
    var currentSelection,
    currentSelectionColor,
    currentSelectionBorder,
    history = [],
    
    unhighlight = function () {
        if (currentSelection) {
            currentSelection.css('background',currentSelectionColor);
            currentSelection.css('border',currentSelectionBorder);
        }
    },

    highlight = function () {
        currentSelectionColor=currentSelection.css('background');
        currentSelectionBorder=currentSelection.css('border');
        currentSelection.css('background-color','yellow');
        currentSelection.css('border','3px solid black');
    },

    updateSelect = function(elt) {
        unhighlight();
        currentSelection=elt;
        highlight();
    },

    selectCurrentMouse = function(event) {
        updateSelect($(event.target));
    },


    keyCommand = function(event) {
        var key = event.which;
	event.stopPropagation();
        if (key === 38) {//keyup
            var i=0;
            if ((currentSelection.parent().length > 0) && 
                (currentSelection.closest('body').length>0)) {
                history.push(currentSelection);
                updateSelect(currentSelection.parent());
            }
        } else if (key === 40) {
            if (history.length > 0) {
                updateSelect(history.pop());
            }
        }
        else if (key === 13) {//return
            commitSelect();
        }
        else if (key === 27) {//escape
            cleanup();
            cont(null);
        }
	return false;
    },

    cleanup = function() {
        $('body').off('mousemove.highlighter', 
                      selectCurrentMouse);
        $('body').off('keydown.highlighter', keyCommand);
        cancelClick();
    },

    commitSelect = function(evt) {
        cleanup();
        cont(currentSelection);
    },

    cancelClick = captureClick(commitSelect);



    $('body').on('mousemove.highlighter', 
                 selectCurrentMouse);
    $('body').on('keydown.highlighter', keyCommand);

};

var describePath = function(elt, depth, useclass) {
    if (elt.length === 0 || depth<0) {
        return "";
    }
    if (elt.is("body")) {
        return "body";
    } else {
        var prior = describePath(elt.parent(),depth-1, useclass);
        var classSelector = 
        (useclass && elt.attr('class') && elt.attr('class').length > 0) 
        ? "." + elt.attr('class').split(' ').join('.')
        : "";

        return prior + " > " + elt.get(0).nodeName + classSelector;
    }
};

var makeEltFinder = function (elt,useclass) {
    var 
    path = describePath(elt, 20, useclass),
    src = elt.attr('src'),
    text = elt.text(),
    finder = function(jq) {
        var found = jq.find(path);
        if (src || text) {
            found = found.filter(function() {
                    return ((src && $(this).attr('src')===src) ||
                            (text && $(this).text()===text));
                }
                );
        }

        if (found.length > 1) {
            alert("trouble identifying next button");
        }
        
        return found;
    };

    return finder;
};


var choosePaginator = function(cont) {
    selectItem(function(elt) {
	    cont(makeEltFinder(elt,true));
	});
};


var shredElement = function(elt) {
    var 
    scraped={},
    shredInternal = function(node, signature) {
        var text=$(node).text();
        if (text.length > 0) {
            scraped[signature] = text;
        }
        if (node.nodeType === ELEMENT_NODE) {
	    //might want to scrape pictures some day
	    //	    if (node.nodeName === 'IMG') {
	    //		scraped[signature] = '<img src="' + node.src + '">';
	    //	    }
            if (node.href) {
                scraped[signature + " > href"] = node.href;
            }
            if (node.src) {
                scraped[signature + " > src"] = node.src;
            }
            var child=node.firstChild;
            signature = signature + " >";
            while(child) {
                signature = signature+" "+child.nodeName;
                shredInternal(child, signature);
                child=child.nextSibling;
            }
        }
    };

    shredInternal(elt,">");
    return scraped;
};

var shredPage = function(page,path) {
    var items = [];
    $(page)
    .find(path)
    .css('background-color','red')
    .each(
          function() {
              items.push(shredElement(this));
          }
          );
    return items;
};

var tabulate = function(items) {
    var fields = [], rows=[];
    var fieldMap={};
    var fieldCount=0;
    var i, item, row, field, header;
    //count occurrences of all fields
    for (i=0; i<items.length; i++) {
        item=items[i];
        for (field in item) {
            if (item.hasOwnProperty(field)) {
                if (!(fieldMap.hasOwnProperty(field))) {
                    fields[fieldCount] = {field: field, count: 0};
                    fieldMap[field] = fieldCount++;
                }
                fields[fieldMap[field]].count++;
            }
        }
    }
    //build new fieldMap with common items first
    fields.sort(function(a,b) {return b.count-a.count;}); //descending
    fieldMap={};
    for (i=0; i<fields.length; i++) {
        fieldMap[fields[i].field] = i;
    }

    //translate each item to array using fieldMap
    for (i=0; i < items.length; i++) {
        item=items[i];
        row=[];
        for (field in item) {
	    if (item.hasOwnProperty(field)) {
		row[fieldMap[field]]=item[field];
	    }
        }
        rows.push(row);
    }
    header=fields.map(function(item) {return item.count;});
    rows.unshift(header);  //good for debugging
    return rows;
};

var scrapeUrl = function(url,path,cont,sameDoc)  {
    var win = MyWindow.open(url);
    win.load(function () {
            setTimeout(function () {
                    cont(shredPage(win.document(),path));
                    win.close();
                },
                3000);
        });
};


var Pacer = function () {
    var 
    queue = [],
    pending = 0,
    endings = [],
    debug = {},
    timerId;

    var finish = function () {
	var i;
        clearInterval(timerId);
        for (i=0; i<endings.length; i++) {
            endings[i]();
        }
    };

    var doneOne = function(label) {
        --pending;
        if (label) {delete(debug.label);}
    };

    var tick = function() {
        if (queue.length > 0) {
            var task = queue.shift();
            task(doneOne); //task should callback when finished
        }
        if (pending === 0) {
            finish();
        }
    };
    
    this.start = function(period) {
        timerId = setInterval(tick, period);
    };

    this.await = function(cont) {
        endings.push(cont);
    };

    this.todo = function(f, label) {
        ++pending;
        debug[label] = true;
        queue.push(f);
    };
};

var startScrape = function(elt) {

    var path=describePath(elt,20);
    var term = MyWindow.open(null, 'Configure Scraper');
    var msg = term.body();
    var getSettings = function(cont) {

	var scrapeChoice=$('<div><h1>What to scrape?</h1><div><input type="radio" name="scrape-choice" value="self" checked>Just this page</input></div><div><input type="radio" name="scrape-choice" value="list">Multiple pages</input></div></div>');

	var urlList=$("<div><h1>Choose URLs</h1><div>Enter URLs to scrape, one per line</div><textarea id='urls' rows='10' cols='100'>" + window.location + "</textarea>").hide();

	var paginate = $("<div><input type='checkbox' name='paginate' value='paginate'></input> Try to paginate?</div>").hide();
	var paginateCheckbox = paginate.find('input[name="paginate"]');

	var paginateLimit = $("<div><input type='textfield' size='5' name='paginate-limit' value='100'></input> Maximum pagination steps?  Enter 0 to paginate forever but beware!</div>");
	paginateLimit.hide().appendTo(paginate);

	var scrapeButton = $("<div><input type='button' id='scrapeButton' value='scrape'></input></div>");
        
	var urlForm = $("<div></div>").append(scrapeChoice).append(urlList)
	.append(paginate).append(scrapeButton);

	scrapeChoice.find('input[name="scrape-choice"]').change(function() {
		if (scrapeChoice.find('input[name="scrape-choice"]:checked')
		    .val() === "self") {
		    urlList.hide();
		    paginate.hide();
		} else {
		    urlList.show();
		    paginate.show();
		}
	    });

	paginateCheckbox.change(function () {
		paginateLimit.toggle(paginateCheckbox.is(':checked'));
	    });

	var handleInput = function() {
	    var urls, limit;

	    if (scrapeChoice.find('input[name="scrape-choice"]:checked')
		.val() === "self") {
		urls = null;
	    } else {
		urls = urlList.find("#urls").val().split("\n");
	    }

	    paginate = paginate.find('input[name="paginate"]').is(':checked');
	    limit = parseInt(urlForm.find('input[name="paginate-limit"]').
			     val(),
			     10);
	    if (isNaN(limit)) {limit=0;}
	    urlForm.remove();
	    term.close();
	    if (paginate) {
		alert('click on the "next" button');
		choosePaginator(function(paginator) {
			cont({urls: urls, paginator: paginator, limit: limit});
		    });
	    } else {
		cont({urls: urls});
	    }
	};
	scrapeButton.find("#scrapeButton").click(handleInput);
	msg.append(urlForm);
    };


    var scrapeUrls = function(urls, path, paginator, limit, cont) { 

	var i;
	var scrapedItems=[];
	var receiveScrape = function(items) {
	    [].push.apply(scrapedItems,items);
	};

	var pacer = new Pacer();

	var scrapeTask = function(url, limit) {
	    return function(cont) {
		scrapeUrl(url, limit, cont);
	    };
	};

	var scrapeUrl = function(url, limit, cont) {
	    var win = MyWindow.open(url);
	    win.load(function () { 
		    setTimeout(function() {
			    var doc = win.document();
			    var nextLink = null;
			    receiveScrape(shredPage(doc,path));

			    if (paginator && (limit !== 0)) {
				//feature: a negative limit will run forever
				nextLink = paginator(doc)
				    .parents()
				    .andSelf()
				    .filter('[href]')
				    .attr('href');      
				if (nextLink) {
				    pacer.todo(scrapeTask(nextLink, limit-1),
					       nextLink);
				}
			    }
			    win.close();
			    cont(url);
			},
			1000);//leave some time for js to settle
		});
	};

	for (i=0; i<urls.length; i++) {
	    pacer.todo(scrapeTask(urls[i], limit - 1), urls[i]);
	}
	pacer.await(function() {cont(tabulate(scrapedItems));});
	pacer.start(500);
    };

    var showResults = function(items) {
	var i, j, row, item, cell;
	var results=$("<table style='border-collapse:true;'></table>");
	for (i=0; i<items.length; i++) {
	    row=$('<tr></tr>');
	    item=items[i];
	    for (j=0; j<item.length; j++) {
		cell=$('<td></td>');
		cell.text(item[j]);
		row.append(cell);
	    }
	    results.append(row);
	}
	results.find('td').css({'border':'2px solid black', 
				'border-collapse': 'true'});
	var msg = MyWindow.open(null,'Scraper Results').body();
	msg.append('<h2>Results</h2>');
	msg.append(results);
	return;
    };
    $(path).css('background-color','red');
    getSettings(function(settings) {
	    if (settings.urls) {
		scrapeUrls(settings.urls, path, 
			   settings.paginator, settings.limit, 
			   showResults);
	    } else {
		showResults(tabulate(shredPage(document, path)));
	    }
	});
};



//bookmarklet cruft.  load necessary scripts, then run.
var main = function() {
    alert("Move the mouse to select an item.  Use the up-arrow key to widen the selection.  Hit return when done.");
    selectItem(startScrape);
};

var startIt = function() {
	$(document).ready(main);
    };

var loadScript = function(script, cont) {
    var jsCode=document.createElement('script');
    jsCode.setAttribute('src',script);
    jsCode.setAttribute('onload',cont);
    document.body.appendChild(jsCode);
};

loadScript("http://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js","startIt()");
