if (typeof (ELEMENT_NODE)==='undefined') {
    ELEMENT_NODE=1;
}

// abstract a window so you can use a pop-open window or an iframe
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

//for future use, if you want to handle pages with iframes
var allFrames = function(win) {

    win = win || window;
    result = $('body',win);

    for (i=0; i < win.frames.length; i++) {
	if (win.frames[i].location &&
	    win.frames[i].location.protocol === win.location.protocol &&
	    win.frames[i].location.host === win.location.host) {
	    result = result.add("body",win.frames[i].document);
	}
    }

};

//sequencer for asynchronous functions.
//takes a list of functions, each of which should take one argument:
//a deferred object that the function should resolve when it finishes.
//deferredSequence does the bookkeeping to execute one after the other.
//each can depend on previous state.
//returns a promise object that resolves when the last functions does
//or, if any function in list fails, overall promise fails
var deferredSequence = function() {
    var args = Array.prototype.slice.call(arguments);
    var allDone = $.Deferred();
    var fail = function () {allDone.reject();};
    var next = function() {
	if (args.length === 0) {
	    allDone.resolve();
	} else {
	    var deferred = $.Deferred();
	    deferred.done(next);
	    deferred.fail(fail);
	    (args.shift())(deferred);
	};
    };
    
    next();
    return allDone.promise();
};

//bind (once) to a click event
//but override any other click events
//returns a function that can be called to cancel the listener
var captureClick = function (cont) {
    //can't use jquery because it doesn't do events in capture phase
    //so it can't preventDefault soon enough to prevent other click events.
    //Unlike jq, returning false in a standard event handler does NOT
    //prevent bubbling/default, so we need to force that explicitly
    var listener = function(evt) {
	alert('outer click');
	evt.stopPropagation();
	evt.preventDefault();
	document.removeEventListener('click', listener, true);
	cont(evt.target);
	return false; 
    };
    document.addEventListener('click', listener, true);
    return function() {
	document.removeEventListener('click', listener, true);
    };
};


//when called, lets user interactively choose a page element
//returns a deferred object that will be resolved when user chooses element
var selectItem = function(win) {
    var currentSelection,
    currentSelectionColor,
    currentSelectionBorder,
    currentSelectionPath,
    history = [],
    highlightStyle = $('<style>.scraper-highlight {background-color: wheat}</style>'),
    
    done = $.Deferred(),
    win = win || window,

    unhighlight = function () {
        if (currentSelection) {
	    $(currentSelectionPath).removeClass('scraper-highlight');
            currentSelection.css('background',currentSelectionColor);
            currentSelection.css('border',currentSelectionBorder);
        }
    },

    highlight = function () {
	$(currentSelectionPath).addClass('scraper-highlight');
	//use inline style to override any class-based styling
        currentSelectionColor=currentSelection.css('background');
        currentSelectionBorder=currentSelection.css('border');
        currentSelection.css('background-color','yellow');
        currentSelection.css('border','3px solid black');
    },

    updateSelect = function(elt) {
	if (currentSelection !== elt) {
	    unhighlight();
	    currentSelection=elt;
	    if (elt) {
		currentSelectionPath = describePath(currentSelection,20);
		highlight();
	    }
	}
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
	    updateSelect(null);
	    commitSelect();
        }
	return false;
    },

    setup = function() {
	highlightStyle.appendTo(body);
	body.on('mousemove.highlighter', selectCurrentMouse);
	body.on('keydown.highlighter', keyCommand);
	body.each(function() {
		this.addEventListener('click', captureClick, true);});
    },

    cleanup = function() {
	unhighlight();
	highlightStyle.remove();
        body.off('mousemove.highlighter', selectCurrentMouse);
        body.off('keydown.highlighter', keyCommand);
	body.each(function() {
		this.removeEventListener('click', captureClick, true);
	    });
    },

    commitSelect = function(evt) {
        cleanup();
	done.resolve(currentSelection);
    },

    captureClick = function(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	setTimeout(function() {commitSelect(evt.target);}, 10)
	return false; 
    },

    body=$('body',win.document);

    setup();

    return done.promise();
};

var describePath = function(elt, depth, useClass) {
    if (!elt || elt.length === 0 || depth<0) {
        return "";
    }
    if (elt.is("body")) {
        return "body";
    } else {
        var prior = describePath(elt.parent(),depth-1, useClass);
        var classSelector = 
        (useClass && elt.attr('class') && elt.attr('class').length > 0) 
        ? "." + elt.attr('class').split(' ').join('.')
        : "";

        return prior + " > " + elt.get(0).nodeName + classSelector;
    }
};

var makeEltFinder = function (elt, useClass) {
    var 
    path = describePath(elt, 20, useClass),
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


var choosePaginator = function() {
    done = $.Deferred();
    selectItem().done(function(elt) {
	    done.resolve(makeEltFinder(elt,true));
	});
    return done.promise();
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


//schedule a task queue.  add/execute tasks
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


var configForm = function (win) {
    var settings = {varying: []};
    var form;
    var result = $.Deferred();

    var getForm = function(done) {

	var parseForm = function(evt) {
	    form = $(evt.target);
	
	    settings.fixed = $(this).serializeArray();
	    settings.formPath = describePath(form, 20);
	    evt.stopPropagation();
	    evt.preventDefault();
	    done.resolve();
	    return false;  //so form isn't submitted
	}

	win.alert("Fill out this form for a typical query, then submit it.");
	$(win.document.body).find('form').one('submit', parseForm);
    }

    var getVarying = function(done) {
	var deferred = $.Deferred();

	var receiveField = function(field) {
	    if (field === null) {
		//user finished; return results
		done.resolve();
	    } else {
		if (field.attr('name')) {
		    field.css('background-color','red');
		    settings.varying.push({name: field.attr('name')});
		} else {
		    alert("invalid field selected.");
		}
		selectItem(win).done(receiveField);
	    }
	}

	alert("Now click on fields you want to change as you scrape.  Click the escape key (esc) when done.");
	selectItem(win).done(receiveField);
    }

    var fillVarying = function(done) {

	var receiveValues = function (evt) {
	    var i;
	    var count=0;
	    for (i=0; i<settings.varying.length; i++) {
		var field = settings.varying[i].name;
		var values = form.find('textarea[name="' + field +'"]')
		    .val().split('\n');
		if ((count > 0) && (values.length !== count)) {
		    alert("mismatched number of values in different fields!");
		}
		count = values.length;
		settings.varying[i].values = values;
	    }
	    done.resolve();
	    evt.stopPropagation();
	    evt.preventDefault();
	    return false;
	}

	var i;
	for (i=0; i<settings.varying.length; i++) {
	    form.find('input[name="' + settings.varying[i].name +'"]')
		.replaceWith('<textarea name="' + settings.varying[i].name
			     + '" rows=10">scraper values here</textarea>');
	}
	alert("Fill in the values you want to submit, one per line.  Then click the submit button");
	form.one('submit', receiveValues);
    }


    win = win || window;
    deferredSequence(getForm,
		     getVarying,
		     fillVarying,
		     function () {
			 if (console) console.log(settings);
			 result.resolve(settings)});
};

var scrapeForm = function(settings) {
    
};

var configScrape = function(elt) {

    if (elt===null) return;

    var path=describePath(elt,20);
    var term = MyWindow.open(null, 'Configure Scraper');
    var startDoc = elt.get(0).ownerDocument; //possibly in iframe
    var msg = term.body();
    var getSettings = function() {
	var done = $.Deferred();

	var scrapeChoice=$('<div><h1>What to scrape?</h1><div><input type="radio" name="scrape-choice" value="self" checked>Just this page</input></div><div><input type="radio" name="scrape-choice" value="list">Multiple pages/pagination</input></div><input type="radio" name="scrape-choice" value="form">Multiple values in a form on this page</input></div>');

	var urlList=$("<div><h2>Choose URLs</h2><div>Enter URLs to scrape, one per line</div><textarea id='urls' rows='10' cols='100'>" + startDoc.URL + "</textarea>").hide();

	var formURL = $("<div><h2>Form URL</h2><div>Enter the URL of the form you want to submit</div><input type='textfield' id='formurl' name='formurl' value = '" + startDoc.URL + "' size='80'></input>").hide();

	var paginate = $("<div><h2>Pagination</h2><input type='checkbox' name='paginate' value='paginate'></input> Try to paginate?</div>").hide();
	var paginateCheckbox = paginate.find('input[name="paginate"]');

	var paginateLimit = $("<div><input type='textfield' size='5' name='paginate-limit' value='100'></input> Maximum pagination steps?  Enter 0 to paginate forever but beware!</div>");
	paginateLimit.hide().appendTo(paginate);

	var scrapeButton = $("<div><input type='button' id='scrapeButton' value='scrape'></input></div>");
        
	var urlForm = $("<div></div>").append(scrapeChoice).append(urlList)
	.append(formURL).append(paginate).append(scrapeButton);

	var handleInput = function() {
	    var urls, limit;

	    if (scrapeChoice.find('input[name="scrape-choice"]:checked')
		.val() === "self") {
		urls = null;
	    } else {
		urls = urlList.find("#urls").val().split("\n");
	    }

	    paginate = paginate.find('input[name="paginate"]').is(':checked');
	    limit = parseInt(urlForm
			     .find('input[name="paginate-limit"]')
			     .val(),
			     10);
	    if (isNaN(limit)) {limit=0;}
	    if (paginate) {
		alert('click on the "next" button');
		choosePaginator().done(function(paginator) {
			done.resolve({urls: urls, paginator: paginator, 
				    limit: limit});
		    });
	    } else {
		done.resolve({urls: urls});
	    }
	    urlForm.remove();
	    term.close();
	};

	scrapeChoice.find('input[name="scrape-choice"]').change(function() {
		var choice = 
		    scrapeChoice.find('input[name="scrape-choice"]:checked')
		    .val();
		if (choice === "list") {
		    urlList.show();
		} else {
		    urlList.hide();
		}
		if (choice === "self") {
		    paginate.hide();
		} else {
		    paginate.show();
		}
		if (choice === "form") {
		    formURL.show();
		} else {
		    formURL.hide();
		}
	    });

	paginateCheckbox.change(function () {
		paginateLimit.toggle(paginateCheckbox.is(':checked'));
	    });

	scrapeButton.find("#scrapeButton").click(handleInput);
	msg.append(urlForm);
	return done.promise();
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

	var doneUrls = {};
	var scrapeUrl = function(url, limit, cont) {
	    var win = MyWindow.open(url);
	    doneUrls[url] = true;
	    win.load(function () { 
		    setTimeout(function() {
			    var doc = win.document();
			    var anchor, nextLink = null;
			    receiveScrape(shredPage(doc,path));

			    if (paginator && (limit !== 0)) {
				//feature: a negative limit will run forever
				//until no pagination link is found
				anchor = paginator(doc)
				    .parents()
				    .andSelf()
				    .filter('[href]');
				if (anchor.length > 0) {
				    //use .href instead of .attr['href']
				    //to ensure getting absolute uri 
				    nextLink = anchor.get(0).href;
				    if (nextLink && !doneUrls[nextLink]) {
					pacer.todo(scrapeTask(nextLink, 
							      limit-1),
						   nextLink);
				    }
				}
			    }
			    win.close();
			    cont(url);
			},
			1000);//leave some time for page's js to run
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
    getSettings().done(function(settings) {
	    if (settings.urls) {
		scrapeUrls(settings.urls, path, 
			   settings.paginator, settings.limit, 
			   showResults);
	    } else {
		showResults(tabulate(shredPage(startDoc, path)));
	    }
	});
};



//bookmarklet cruft.  load necessary scripts, then run.
var main = function() {
    alert("Move the mouse to select an item.  Use the up-arrow key to widen the selection.  Hit return when done.");
    selectItem().done(configScrape);
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

loadScript("http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js","startIt()");
