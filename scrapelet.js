if (typeof(ELEMENT_NODE)=='undefined') ELEMENT_NODE=1;
const PAGE_WAIT=1000; //how long to wait before scraping page
const PAGE_RATE=1000; //rate at which pages are opened to scrape

var MyWindow = {sameDoc: true, zIndex: 5001};
MyWindow.open = function(url, title, sameDoc) {
    var win, body, setUrl;
    sameDoc = sameDoc || this.sameDoc;
    if (this.sameDoc) { //frame 
	if (url) {
	    win = $('<iframe title="'+title+'" src="' + url + '" target="scraper"></iframe>');
	} else {
	    win = $('<iframe title="'+title+'"></iframe>');
	}
	win.css({
		position: "relative", 
		    top:"100px",
		    width:"100%",
		    height:"400px", 
		    border: "3px solid black",
		    "background-color": "white",
		    "z-index": (this.zIndex++).toString()
		    });
	$("body").prepend(win);
	body = function() {
	    return win.contents().find("body");
	}
	body().text(title);
	close = function() {win.remove();}
	setURL = function (newUrl) {
	    url = newUrl;
	    win.src = newUrl;
	}
    } else { //new window
	win = window.open(url,title);
	if (!url) {
	    win.document.write('<html><head><title>'+title+
			       '</title></head><body></body></html>');
	}
	body = function() {
	    return $(win.document.body);
	}
	close = function() {
	    win.close();
	}
	setUrl = function (newUrl)  {
	    url = newUrl;
	    win.location.href = newUrl;
	}
    }
    load = function(handler) {
	if (url) {
	    alert(win);
	    $(win).load(handler);
	} else {
	    handler();
	}
    }


    return {
	body: body,
	load: load,
	setUrl: setUrl,
	close: close
    };
}
    
// execute (asynchronous) f over a sequence of items
// at some specified rate
// when done, call cont.
var timedEach = function(items, f, wait, cont, finalWait) {
    var i = 0;

    if (!finalWait) 
	finalWait=0;

    var timedInternal = function() {
	if (i == items.length) {
	    if (cont) setTimeout(cont, finalWait);
	} else {
	    f(items[i++]);
	    setTimeout(timedInternal, wait);
	}
    }

    timedInternal();
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
    }
    document.addEventListener('click', listener, true);
    return (function() {
	    document.removeEventListener('click', listener, true);
	});
};


//when called, lets user interactively choose a page element
//when done, invokes cont passing chosen element
var selectItem = function(cont) {
    var currentSelection;
    var currentSelectionColor;
    var currentSelectionBorder;
    var history = [];
    
    var unhighlight = function () {
	if (currentSelection) {
	    currentSelection.css('background',currentSelectionColor);
	    currentSelection.css('border',currentSelectionBorder);
	}
    }
    var highlight = function () {
	currentSelectionColor=currentSelection.css('background');
	currentSelectionBorder=currentSelection.css('border');
	currentSelection.css('background-color','yellow');
	currentSelection.css('border','3px solid black');
    }

    function updateSelect(elt) {
	unhighlight();
	currentSelection=elt;
	highlight();
    }

    var selectCurrentMouse = function(event) {
	updateSelect($(event.target));
    }

    function commitSelect(evt) {
	cleanup();
	cont(currentSelection);
    }

    var keyCommand = function(event) {
	var key = event.which;
	if (key == 38) {//keyup
	    var i=0;
	    if ((currentSelection.parent().length > 0) && 
		(currentSelection.closest('body').length>0)) {
		history.push(currentSelection);
		updateSelect(currentSelection.parent());
	    }
	} else if (key == 40) {
	    if (history.length > 0) {
		updateSelect(history.pop());
	    }
	}
	else if (key == 13) {//return
	    commitSelect();
	}
	else if (key == 27) {//escape
	    cleanup();
	    cont(null);
	}
    }

    var cancelClick = captureClick(commitSelect);

    $('body').on('mousemove.highlighter', 
		 selectCurrentMouse);
    $('body').on('keydown.highlighter', keyCommand);

    var cleanup = function() {
	$('body').off('mousemove.highlighter', 
		      selectCurrentMouse);
	$('body').off('keydown.highlighter', keyCommand);
	cancelClick();
    }

};

var describePath = function(elt, depth, useclass) {
    if (elt.length == 0 || depth<0) {
	return "";
    }
    if (elt.is("body")) {
	return "body";
    }
    else {
	var prior = describePath(elt.parent(),depth-1, useclass);
	var classSelector = 
	(useclass && elt.attr('class') && elt.attr('class').length > 0) 
	? "." + elt.attr('class').split(' ').join('.')
	: "";

	return prior + " > " + elt.get(0).nodeName + classSelector;
    }
};

var makeEltFinder = function (elt,useclass) {
    var path= describePath(elt, 20, useclass);
    var src=elt.attr('src');
    var text=elt.text();

    var finder = function(jq) {
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
    }

    return finder;
}


    var choosePaginator = function(cont) {
	selectItem(function(elt) {
		cont(makeEltFinder(elt,true))
	    });
    }


var shredElement = function(elt) {
    var scraped={};

    var shredInternal = function(node, signature) {
	var text=$(node).text();
	if (text.length > 0) {
	    scraped[signature] = text;
	}
	if (node.nodeType=ELEMENT_NODE) {
	    if (node.href) {
		scraped[signature + " href"] = node.href;
	    }
	    if (node.src) {
		scraped[signature + "src"] = node.src;
	    }
	    var child=node.firstChild;
	    signature = signature + " >";
	    while(child) {
		signature = signature+" "+child.nodeName;
		shredInternal(child, signature);
		child=child.nextSibling;
	    }
	}
    }

    shredInternal(elt,">");
    return scraped;
};

var shredPage = function(page,path) {
    var items = [];
    $(page).find(path).css('background-color','red').each(
							  function() {
							      items.push(shredElement(this));
							  }
							  );
    return items;
};

var tabulate = function(items) {
    var fields = [];
    var fieldMap={};
    var fieldCount=0;
    //count occurrences of all fields
    for (var i=0; i<items.length; i++) {
	var item=items[i];
	for (field in item) {
	    if (item.hasOwnProperty(field)) {
		if (!(field in fieldMap)) {
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
    for (var i=0; i<fields.length; i++) {
	fieldMap[fields[i].field] = i;
    }

    //translate each item to array using fieldMap
    var rows=[];
    for (var i=0; i < items.length; i++) {
	var item=items[i];
	var row=[];
	for (var field in item) {
	    row[fieldMap[field]]=item[field];
	}
	rows.push(row);
    }
    var header=fields.map(function(item) {return item.count;});
    rows.unshift(header);  //good for debugging
    return rows;
};

var scrapeUrl = function(url,path,cont,sameDoc)  {
    var win = MyWindow.open(url,'scrape url');
    win.load(function () {
	    setTimeout(function () {
		    cont(shredPage(win.body(),path));
		    win.close();
		},
		PAGE_WAIT);
	});
};


var startScrape = function(elt) {

    var path=describePath(elt,20);
    var term = MyWindow.open(null, 'Configure Scraper');
    var msg = term.body();
    var getSettings = function(cont) {

	var scrapeChoice=$('<div><h1>What to scrape?</h1><div><input type="radio" name="scrape-choice" value="self" checked>Just this page</input></div><div><input type="radio" name="scrape-choice" value="list">Multiple pages</input></div></div>');

	var urlList=$("<div><h1>Choose URLs</h1><div>Enter URLs to scrape, one per line</div><textarea id='urls' rows='10' cols='100'>" + window.location + "</textarea>").hide();

	var paginate = $("<div><input type='checkbox' name='paginate' value='paginate'></input> Try to paginate?</div>").hide();

	var scrapeButton = $("<div><input type='button' id='scrapeButton' value='scrape'></input></div>");
	

	var urlForm = $("<div></div>").append(scrapeChoice).append(urlList)
	.append(paginate).append(scrapeButton);

	scrapeChoice.find('input[name="scrape-choice"]').change(function() {
		if (scrapeChoice.find('input[name="scrape-choice"]:checked')
		    .val() == "self") {
		    urlList.hide();
		    paginate.hide();
		} else {
		    urlList.show();
		    paginate.show();
		}
	    });

	var handleInput = function() {
	    urlForm.remove();
	    var urls;
	    if (scrapeChoice.find('input[name="scrape-choice"]:checked')
		.val() == "self") {
		urls = null;
	    } else {
		urls = urlList.find("#urls").val().split("\n");
	    }

	    paginate = paginate.find('input[name=paginate]').is(':checked');
	    if (paginate) {
		alert('click on the "next" button');
		choosePaginator(function(paginator) {
			cont({urls: urls, paginator: paginator});
		    });
	    } else {
		cont({urls: urls});
	    }
	};
	scrapeButton.find("#scrapeButton").click(handleInput);
	msg.append(urlForm);
    }


    var scrapePagination = function(url, path, paginator, limit, cont, 
				    sameDoc) {
	var scrapedItems=[];
	var receiveScrape = function(items) {
	    [].push.apply(scrapedItems,items);
	}
	var complete;
	if (sameDoc) {
	    frame = $('<iframe src=' + url + ' target="scraper"></iframe>');
	    frame.css({"position": "relative", "width":"100%",
			"height":"400px", "z-index":"5001"});
	    $("body").prepend(frame);
	    getBody = function() {
		return frame.contents();
	    }
	    setPage = function(url,cont) {
		frame.src = url;
		frame.load(cont);
	    }
	    complete = function() {
		cont(tabulate(scrapedItems));
		frame.remove();
	    };
	} else {
	    win=window.open(url);
	    getBody = function() {
		return $(win.document.documentElement);
	    }
	    setPage = function(url,cont) {
		win.location.href = url;
		$(win).load(cont);
	    }
	    complete = function() {
		cont(tabulate(scrapedItems));
		win.close();
	    };
	}

	win = Mywindow.open(url, 'Paginate');
	getBody = function() {
	    return win.body();
	}

	var doPage = function() {
	    var body = getBody();
	    receiveScrape(shredPage(body,path));
	    var nextButton = paginator(body).parents().andSelf().filter('[href]').attr('href');
	    if ((limit-- > 0) && nextButton && (nextButton.length > 0)) {
		//		nextButton.click();
		if (console) {console.log(nextButton);}
		setPage(nextButton,
			function() {
			    setTimeout(doPage, PAGE_WAIT);
			});
	    } else {
		complete();
	    }
	}

	setTimeout(doPage, PAGE_WAIT);
    };

    var scrapeUrls = function(urls, path, cont) {

	var scrapedItems=[];
	var receiveScrape = function(items) {
	    [].push.apply(scrapedItems,items);
	}

	if (urls) {
	    timedEach(urls, 
		      function(url) {scrapeUrl(url,path,receiveScrape);},
		      PAGE_RATE,
		      function() {cont(tabulate(scrapedItems));},
		      PAGE_WAIT
		      );
	} else {
	    //just scrape current page
	    cont(tabulate(shredPage(document, path)));
	}
    };

    var showResults = function(items) {
	var results=$("<table style='border-collapse:true;'></table>");
	for (var i=0; i<items.length; i++) {
	    var row=$('<tr></tr>');
	    var item=items[i];
	    for (var j=0; j<item.length; j++) {
		var cell=$('<td></td>');
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
	    if (settings.paginator) {
		scrapePagination(window.location.href, path, 
				 settings.paginator, 10, 
				 showResults,false)
		    } else {
		scrapeUrls(settings.urls, path, showResults);
	    }
	});
}



//bookmarklet cruft.  load necessary scripts, then run.
    var main = function() {
	alert("Move the mouse to select an item.  Use the up-arrow key to widen the selection.  Hit return when done.");
	selectItem(startScrape);
    }

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
