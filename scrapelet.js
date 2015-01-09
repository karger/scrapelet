/* var alert, $, ELEMENT_NODE; */

if (typeof (ELEMENT_NODE)==='undefined') {
    ELEMENT_NODE=1;
}

var debug = {
    log: function (s) {
        if (console) { console.log(s); }
    }
};

if (typeof Object.create !== 'function') {
    Object.create = function (o) {
        function F() {}
        F.prototype = o;
        return new F();
    };
}


// abstract a window so you can use a pop-open window or an iframe

var MyFrame = {sameDoc: true, zIndex: 5001};
MyFrame.open = function(url, title, sameDoc) {
    var frame, win, oneLoad
    , close = function() {
        win.close();
        if (sameDoc) {
            frame.remove();
        }
    }
    ;
    debug.log('frame ' + url + ' ' + title);
    if ((typeof(sameDoc) === null || typeof(sameDoc)==="undefined")) {
        sameDoc = this.sameDoc;
        }
    if (sameDoc) { //frame 
        frame = $('<iframe title="'+title+'"></iframe>');
        frame.css({
            top:"10px",
            width:"100%",
            height:"400px", 
            border: "3px solid black",
            "background-color": "white",
            "z-index": (this.zIndex++).toString()
        });
        $("body").prepend(frame);
        win = frame.get(0).contentWindow;
        if (url) {win.document.location = url;}
    } else {
        win = window.open(url, title);
    }

    //onload is a hack to deal with inconsistent asynchrony and
    //behavior of load events in iframes and windows when target is
    //about:blank 
    //this case ought to be synchronous, but isn't always
    //so we have to use load events, but these don't always fire
    //see http://hsivonen.iki.fi/about-blank/
    
    oneLoad = function(f) {
        if (!url) {
            setTimeout(f, 100);
        } else {
            $(win).one('load',f);
        }
    };
    return {contentWindow: win, close: close, oneLoad: oneLoad};
};



//for future use, if you want to handle pages with iframes
var allFrames = function(winArg) {

    var win = winArg || window
    , i
    , result = $('body',win);

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
    var args = Array.prototype.slice.call(arguments)
    , allDone = $.Deferred()
    , fail = function () {allDone.reject();}
    , next = function() {
        if (args.length === 0) {
            allDone.resolve();
        } else {
            var deferred = $.Deferred();
            deferred.done(next);
            deferred.fail(fail);
            (args.shift())(deferred);
        }
    };
    
    next();
    return allDone.promise();
};


//iterates an asynchronous function f over a range of values
//serializes invocations---one doesn't begin till previous ends
//f should return a deferred object
var forDeferred = function(f, start, limit) {
    var done = $.Deferred()
    , forInner = function() {
        var todo;
        if (start >= limit) {
            done.resolve();
        } else {
            todo = f(start++);
            todo.done(forInner);
        }
    }
    ;
    forInner();
    return done;
};

var Slowly = function(period) {
    var last = $.Deferred().resolve()
    , sleep = function (t) {
        var done=$.Deferred();
        setTimeout(function () {done.resolve();}, t);
        return done.promise();
    }
    ;
    period = period || 1000;
    this.exec = function(f) {
        last = last.pipe(function () {
            f(); 
            return sleep(period);
        });
    };
};
//when called, lets user interactively choose a page element
//returns a deferred object that will be resolved when user chooses element
var selectItem = function(winArg) {
    var currentSelection
    , win = winArg || window
    , currentSelectionColor
    , currentSelectionBorder
    , currentSelectionPath
    , history = []
    , highlightStyle = $('<style>.scraper-highlight {background-color: wheat}</style>')
    
    , done = $.Deferred()
    , body=$('body',win.document)

    , commitSelect = function(evt) {
        cleanup();
        done.resolve(currentSelection);
    }

    , captureClick = function(evt) {
        //Unlike jq, returning false in a standard event handler does
        //NOT prevent bubbling/default, so we need to force that explicitly 
        evt.stopPropagation();
        evt.preventDefault();
        setTimeout(function() {commitSelect(evt.target);}, 10);
        return false; 
    }

    , unhighlight = function () {
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
    }

    , updateSelect = function(elt) {
        if (currentSelection !== elt) {
            unhighlight();
            currentSelection=elt;
            if (elt) {
                currentSelectionPath = describePath(currentSelection,20);
                highlight();
            }
        }
    }

    , selectCurrentMouse = function(event) {
        updateSelect($(event.target));
    }


    , keyCommand = function(event) {
        var i, key = event.which;
        event.stopPropagation();
        if (key === 38) {//arrow up
            i=0;
            if ((currentSelection.parent().length > 0) && 
                (currentSelection.closest('body').length>0)) {
                history.push(currentSelection);
                updateSelect(currentSelection.parent());
            }
        } else if (key === 40) {//down arrow
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
    }

    , setup = function() {
        highlightStyle.appendTo(body);
        body.on('mousemove.highlighter', selectCurrentMouse);
        body.on('keydown.highlighter', keyCommand);
        body.each(function() {
            //can't use $.on() because it doesn't do events in
            //capture phase, so it can't stop propagation soon enough
            //to prevent other click events. 
            this.addEventListener('click', captureClick, true);});
    }

    , cleanup = function() {
        unhighlight();
        highlightStyle.remove();
        body.off('mousemove.highlighter', selectCurrentMouse);
        body.off('keydown.highlighter', keyCommand);
        body.each(function() {
            this.removeEventListener('click', captureClick, true);
        });
    }

    ;

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
        var prior = describePath(elt.parent(),depth-1, useClass)
        , classSelector = 
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
            debug.log("vague element finder (" + path + ") returned" + found.length + "matches");
        }
        
        return found;
    };

    return finder;
};


var choosePaginator = function() {
    var done = $.Deferred();
    selectItem().done(function(elt) {
        done.resolve(makeEltFinder(elt,true));
    });
    return done.promise();
};


var shredElement = function(elt) {
    var 
    scraped={}
    , shredInternal = function(node, signature) {
        var text=$(node).text().trim()
        , child
        ;
        if (text.length > 0) {
            scraped[signature] = text;
        }
        if (node.nodeType === ELEMENT_NODE) {
            //might want to scrape pictures some day
            //      if (node.nodeName === 'IMG') {
            //          scraped[signature] = '<img src="' + node.src + '">';
            //      }
            if (node.href) {
                scraped[signature + " > href"] = node.href;
            }
            if (node.src) {
                scraped[signature + " > src"] = node.src;
            }
            child=node.firstChild;
            signature = signature + " >";
            while(typeof(child) !== "undefined" && child !== null ) {
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
    var fields = [], rows=[]
    , fieldMap={}
    , fieldCount=0
    , i, item, row, field, header, h
    , fieldData
    , fieldList = []
    , hashes={}, newItems = []
    
    , addHash = function(i, x) {
        i = ((i<<5)-i)+x;
        i = i&i; // Convert to 32bit integer
        return i;
    }

    , stringHash = function(s) {
        var i, ch
        , hash = 0;

        if (s.length === 0) {return hash;}
        for (i = 0; i < s.length; i++) {
            ch = s.charCodeAt(i);
            hash = ((hash<<5)-hash)+ch;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    };


    //count occurrences and compute hashes of all fields
    for (i=0; i<items.length; i++) {
        item=items[i];
        for (field in item) {
            if (item.hasOwnProperty(field)) {
                if (!(fields.hasOwnProperty(field))) {
                    fields[field] = {field: field, 
                                     count: 0,
                                     hash: 0};
                }
                fieldData = fields[field];
                fieldData.count++;
                fieldData.hash = addHash(addHash(fieldData.hash,i),
                                         stringHash(item[field]));
            }
        }
    }

    //collect fields but skip duplicates
    i=0;
    for (field in fields) {
        if (fields.hasOwnProperty(field)) {
            fieldData = fields[field];
            if (!hashes[fieldData.hash]) {
                hashes[fieldData.hash] = true;
                fieldList[i++] = fieldData;
            }
        }
    }

    //build new fieldMap with common items first
    fieldList.sort(function(a,b) {return b.count-a.count;}); //descending
    fieldMap={};
    for (i=0; i<fieldList.length; i++) {
        fieldMap[fieldList[i].field] = i;
    }

    //translate each item to array using fieldMap
    for (i=0; i < items.length; i++) {
        item=items[i];
        row=[];
        for (field in item) {
            if (item.hasOwnProperty(field) 
                && fieldMap.hasOwnProperty(field)) {
                row[fieldMap[field]]=item[field];
            }
        }
        rows.push(row);
    }
    header=fieldList.map(function(item) {return item.count;});
    rows.unshift(header);  //good for debugging
    return rows;
};



var configForm = function (win) {
    var settings = {varying: []}
    , form
    , result = $.Deferred()

    , getForm = function(done) {

        var parseForm = function(evt) {
            form = $(evt.target);
            
            settings.fixed = $(this).serializeArray();
            settings.formPath = describePath(form, 20);
            evt.stopPropagation();
            evt.preventDefault();
            done.resolve();
            return false;  //so form isn't submitted
        };

        win.alert("Fill out this form for a typical query, then submit it.");
        $(win.document.body).find('form').one('submit', parseForm);
    }

    , getVarying = function(done) {
        var deferred = $.Deferred()

        , receiveField = function(field) {
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
        ;

        alert("Now click on fields you want to change as you scrape.  Click the escape key (esc) when done.");
        selectItem(win).done(receiveField);
    }

    , fillVarying = function(done) {

        var receiveValues = function (evt) {
            var i
            , count=0
            , field
            , values
            ;
            for (i=0; i<settings.varying.length; i++) {
                field = settings.varying[i].name;
                values = form.find('textarea[name="' + field +'"]')
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

        , i
        ;
        for (i=0; i<settings.varying.length; i++) {
            form.find('input[name="' + settings.varying[i].name +'"]')
                .replaceWith('<textarea name="' + settings.varying[i].name
                             + '" rows=10">scraper values here</textarea>');
        }
        alert("Fill in the values you want to submit, one per line.  Then click the submit button");
        form.one('submit', receiveValues);
    };


    win = win || window;
    deferredSequence(getForm,
                     getVarying,
                     fillVarying,
                     function () {
                         debug.log(settings);
                         result.resolve(settings);
                     });
};

var scrapeForm = function(form, settings) {
    var i,j
    , formTask = function(i) {
        return function(done) {
            scrapeFormInstance(i,done);
        };
    }
    , scrapeFormInstance = function(i, done) {
        form.target="scraper"+i;
        for (j=0; j<settings.varying.length; j++) {
            form.find('input[name="' + settings.varying[i].name +'"]')
                .val(settings.varying[j].values[i]);
        }
        form.submit();
        //set up task of scraping results
    }
    ;

    for (i=0; i<settings.varying[0].values.length; i++) {
        pacer.todo(formTask(i));
    }

};


var scrapeUrls = function(urls, path, paginator, limit) { 
    var done = $.Deferred()
    , doneUrls = {}
    , scrapedItems=[]
    , seenHashes = {}
    , receiveScrape = function(items) {
        [].push.apply(scrapedItems,items);
    }

    , scrapeFrame = function(frame, limit, close) {
        var doneFrame = $.Deferred()
        , wrapUp = function () {
            doneFrame.resolve();
            if (close) {frame.close();}
            }
        , scrapeOne = function() {
            var win = frame.contentWindow
            , doc = $(win.document)
            , anchor
            , hash = doc.find('body').html().hashCode();

            debug.log('loaded ' + win.location.href);

            if (seenHashes[hash]) {
                wrapUp();
            } else {
                seenHashes[hash]=true;
                receiveScrape(shredPage(doc,path));

                //feature: a negative limit will loop forever
                //until no pagination link is found
                //on some sites this may cause an infinite loop!
                if (paginator && (limit-- !== 0) && 
                    (anchor=paginator(doc)).length > 0) {
                    //heuristic; use last match if have multiple
                    anchor.get(anchor.length-1).click(); 
                    setTimeout(scrapeOne, 2000);
                } else {
                    wrapUp();
                }
            }
        };
            
        debug.log('scrape frame ' + frame.contentWindow.location.href);
        frame.oneLoad(function () { 
            setTimeout(scrapeOne, 2000);//add some time for page's js to run
        });
        return doneFrame.promise();
    }

    , scrapeForm = function(form, fills) {
        forDeferred(function(i) {
            pacer.enqueue();
        },
                    0, fills.length);
    }

    , scrapeUrl = function(url, limit) {
        debug.log('scrape url ' + url);
        var frame = MyFrame.open(url,url);
        //use url as title so different pages don't overwrite same window
        return scrapeFrame(frame, limit, true);
    };

    forDeferred(function(i) {
        return scrapeUrl(urls[i], limit - 1);
    },0,urls.length)
        .done(function() {done.resolve(tabulate(scrapedItems));});
    return done.promise();
};


var configScrape = function(elt) {

    if (elt===null) {return;}

    var path=describePath(elt,20)
    , term = MyFrame.open("", 'Configure Scraper')
    , startDoc = elt.get(0).ownerDocument //possibly in iframe
    , getSettings = function() {
        var done = $.Deferred()

        , scrapeChoice=$('<div><h1>What to scrape?</h1><div><input type="radio" name="scrape-choice" value="self" checked>Just this page</input></div><div><input type="radio" name="scrape-choice" value="list">Multiple pages/pagination</input></div><input type="radio" name="scrape-choice" value="form">Multiple values in a form on this page</input></div>')

        , urlList=$("<div><h2>Choose URLs</h2><div>Enter URLs to scrape, one per line</div><textarea id='urls' rows='10' cols='100'>" + startDoc.URL + "</textarea>").hide()

        , formURL = $("<div><h2>Form URL</h2><div>Enter the URL of the form you want to submit</div><input type='textfield' id='formurl' name='formurl' value = '" + startDoc.URL + "' size='80'></input>").hide()

        , paginate = $("<div><h2>Pagination</h2><input type='checkbox' name='paginate' value='paginate'></input> Try to paginate?</div>").hide()
        , paginateCheckbox = paginate.find('input[name="paginate"]')

        , paginateLimit = $("<div><input type='textfield' size='5' name='paginate-limit' value='100'></input> Maximum pagination steps?  Enter 0 to paginate forever but beware!</div>").hide().appendTo(paginate)

        , scrapeButton = $("<div><input type='button' id='scrapeButton' value='scrape'></input></div>")
        
        , urlForm = $("<div></div>").append(scrapeChoice).append(urlList)
            .append(formURL).append(paginate).append(scrapeButton)

        , handleInput = function() {
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
        setTimeout(function () {
            //hack.  in ff, if you use the "iframe" version of
            //myFrame, some weird race causes ff to clear the
            //frame contents shortly after the frame is created.
            //so if we create content too soon, it gets zapped.
            //even worse, the document.ready() event gets fired
            //*before* this clearing event, so we can't trigger on
            //document.ready.  And window.load seems not to fire
            //at all (unsurprising, since nothing is loaded!).     
            $(term.contentWindow.document.body).append(urlForm);
        },
                   100);
        return done.promise();
    }


    , showResults = function(items) {
        var i, j, row, item, cell
        , results=$("<table style='border-collapse:true;'></table>")
        , killer = $('<div><button id="kill-row">Kill Row</button><button id="kill-col">Kill Column</button></div>')
        , killRow = function() {
            var todo = killer.parent().parent();
            killer.detach();
            todo.remove();
        }
        , killCol = function() {
            var target = killer.parent().get(0), //td to remove
            row = killer.parent().parent(), //tr 
            targetIndex = -1,
            findMe = function(index) {
                if (this === target) {
                    targetIndex = index;
                    return false;
                }
            };

            killer.detach();
            row.children().each(findMe);  //which td?
            row.parent().children().each(function () {
                    $(this).children().eq(targetIndex).remove();
                });
        }
        , msg = MyFrame.open("",'Scraper Results')
        ;

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
        msg.oneLoad(function() {
            $(msg.contentWindow.document.body)
                .append('<h2>Results</h2>')
                .append(results);
            $('#kill-row',killer).click(killRow);
            $('#kill-col',killer).click(killCol);
            results.on('mouseenter',"td",function() {
                    $(this).prepend(killer);
                });
        });
        return;
    };

    scrollTo(0,0);
    $(path).css('background-color','red');
    getSettings().done(function(settings) {
        if (settings.urls) {
            scrapeUrls(settings.urls, path, 
                       settings.paginator, settings.limit)
                .done(showResults);
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

loadScript("http://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.js","startIt()");
