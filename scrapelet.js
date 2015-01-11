/*jslint browser: true, bitwise: true, devel: true, plusplus: true, vars: true, white: true*/
/*global $, ELEMENT_NODE: true */

if (typeof Object.create !== 'function') {
    Object.create = function (o) {
        var F = function () {};
        F.prototype = o;
        return new F();
    };
}

if (typeof ELEMENT_NODE === 'undefined') {
    ELEMENT_NODE = 1;
}

(function () {
    var debug = {
        log: function (s) {
            if (console) {
                console.log(s);
            }
        }
    };

    // hash from stackoverflow; apparently same as standard java hash
    // http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
    var hashCode = function (str) {
        var i, char, hash = 0;
        if (str.length === 0) {
            return hash;
        }
        for (i = 0; i < str.length; i++) {
            char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    };

    // abstract a window so you can use a separate window or an iframe

    var MyFrame = {
        sameDoc: false,
        zIndex: 5001,
        open: function (url, title, sameDoc) {
            var frame, win, oneLoad,
            close = function () {
                win.close();
                if (sameDoc) {
                    frame.remove();
                }
            };

            debug.log('frame ' + url + ' ' + title);
            if ((typeof sameDoc === null || typeof sameDoc === "undefined")) {
                sameDoc = this.sameDoc;
            }
            if (sameDoc) { //frame 
                frame = $('<iframe title="' + title + '"></iframe>');
                frame.css({
                    top: "10px",
                    width: "100%",
                    'min-height': "400px",
                    border: "3px solid black",
                    "background-color": "white",
                    "z-index": (this.zIndex++).toString()
                });
                setInterval(function () {
                    frame.css({'height': $(frame.get(0).contentWindow).height()});
                },
                            200);
                $("body").prepend(frame);
                win = frame.get(0).contentWindow;
                if (url) { win.document.location = url; }
            } else {
                win = window.open(url, title);
            }

            if (typeof(win) === "undefined") {
                throw new Error("Could not create window");
            }
            //oneLoad is a hack to deal with inconsistent asynchrony and
            //behavior of load events in iframes and windows when target is
            //about:blank 
            //this case ought to be synchronous, but isn't always
            //so we have to use load events, but these don't always fire
            //see http://hsivonen.iki.fi/about-blank/
            oneLoad = function (f) {
                if (!url) {
                    setTimeout(f, 1000);
                } else {
                    $(win).one('load',f);
                }
            };
            return {contentWindow: win, close: close, oneLoad: oneLoad};
        }
    };

    //for future use, if you want to handle pages with iframes
    var allFrames = function (win) {
        var i, result;

        win = win || window;
        result = $('body', win);

        for (i = 0; i < win.frames.length; i++) {
            if (win.frames[i].location
                && win.frames[i].location.protocol === win.location.protocol
                && win.frames[i].location.host === win.location.host) {
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
    var deferredSequence = function () {
        var args = Array.prototype.slice.call(arguments);
        var allDone = $.Deferred();
        var fail = function () {allDone.reject();};
        var next = function () {
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
    //f should return a deferred object that is resolved when f finishes
    var forDeferred = function (f, start, limit) {
        var done = $.Deferred();
        var forInner = function () {
            var todo;
            if (start >= limit) {
                done.resolve();
            } else {
                todo = f(start++);
                todo.done(forInner);
            }
        };
        forInner();
        return done;
    };

    var Slowly = function (period) {
        period = period || 1000;
        var last = $.Deferred().resolve();
        var sleep = function (t) {
            var done = $.Deferred();
            setTimeout(function () {done.resolve(); }, t);
            return done.promise();
        };
        this.exec = function (f) {
            last = last.pipe(function () {
                f(); 
                return sleep(period);
            });
        };
    };

    //lets user interactively choose a page element
    //returns a deferred object that will be resolved when user chooses element
    var selectItem = function (win0) {
        var currentSelection,
        currentSelectionColor,
        currentSelectionBorder,
        currentSelectionPath,
        history = [],
        highlightStyle = $('<style>.scraper-highlight {background-color: wheat;}</style>'),
        done = $.Deferred(),
        win = win0 || window,
        body=$('body',win.document),

        unhighlight = function () {
            if (currentSelection) {
                $(currentSelectionPath).removeClass('scraper-highlight');
                currentSelection.css('background-color', currentSelectionColor);
                currentSelection.css('border', currentSelectionBorder);
            }
        },

        highlight = function () {
            $(currentSelectionPath).addClass('scraper-highlight');
            //use inline style to override any class-based styling
            currentSelectionColor=currentSelection.css('background-color');
            currentSelectionBorder=currentSelection.css('border');
            currentSelection.css('background-color', 'yellow');
            currentSelection.css('border', '3px solid black');
        },

        updateSelect = function (elt) {
            if (currentSelection !== elt) {
                unhighlight();
                currentSelection=elt;
                if (elt) {
                    currentSelectionPath = describePath(currentSelection,20);
                    highlight();
                }
            }
        },

        selectCurrentMouse = function (event) {
            updateSelect($(event.target));
        },

        keyCommand = function (event) {
            var key = event.which;
            event.stopPropagation();
            if (key === 38) {//arrow up
                var i=0;
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
        },

        setup = function () {
            highlightStyle.appendTo(body);
            body.on('mousemove.highlighter', selectCurrentMouse);
            body.on('keydown.highlighter', keyCommand);
            body.each(function () {
                //can't use $.on() because it doesn't do events in
                //capture phase, so it can't stop propagation soon enough
                //to prevent other click events. 
                this.addEventListener('click', captureClick, true);});
        },

        cleanup = function () {
            unhighlight();
            highlightStyle.remove();
            body.off('mousemove.highlighter', selectCurrentMouse);
            body.off('keydown.highlighter', keyCommand);
            body.each(function () {
                this.removeEventListener('click', captureClick, true);
            });
        },

        commitSelect = function (evt) {
            cleanup();
            done.resolve(currentSelection);
        },

        captureClick = function (evt) {
            //Unlike jq, returning false in a standard event handler does
            //NOT prevent bubbling/default, so we need to force that explicitly 
            evt.stopPropagation();
            evt.preventDefault();
            setTimeout(function () {commitSelect(evt.target);}, 10);
            return false; 
        };

        setup();

        return done.promise();
    },

    describePath = function (elt, depth, useClass) {
        if (!elt || elt.length === 0 || depth<0) {
            return "";
        }
        if (elt.is("body")) {
            return "body";
        } else {
            var prior = describePath(elt.parent(),depth-1, useClass);
            var cls=elt.attr('class');
            var classSelector = 
                (useClass && cls && cls.length > 0) 
                ? "." + cls.split(' ').filter(function(x) {
                    return(x.length > 0);
                    }).join('.')
                : "";

            return prior + " > " + elt.get(0).nodeName + classSelector;
        }
    },

    makeEltFinder = function (elt, useClass) {
        var 
        path = describePath(elt, 20, useClass),
        src = elt.attr('src'),
        text = elt.text(),
        finder = function (jq) {
            var found = jq.find(path);
            if (src || text) {
                found = found.filter(function () {
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
    },

    choosePaginator = function () {
        var done = $.Deferred();
        selectItem().done(function (elt) {
            done.resolve(makeEltFinder(elt,true));
        });
        return done.promise();
    },

    shredElement = function (elt) {
        var 
        scraped = {},
        shredInternal = function (node, signature) {
            var text=$(node).text().trim();
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
    },

    shredPage = function (page, path) {
        var items = [];
        $(page)
            .find(path)
            .css('background-color','red')
            .each(
                function () {
                    items.push(shredElement(this));
                }
            );
        return items;
    },

    tabulate = function (items) {
        var fields = [], distinctFields = [], rows=[];
        var fieldMap={}, fieldHash={}, hashField={};
        var fieldCount=0;
        var i, j, item, row, field, header, hash, hashes=[];

        //remove duplicate fields
        for (i=0; i<items.length; i++) {
            item=items[i];
            for (field in item) {
                if (item.hasOwnProperty(field)) {
                    if (!(fieldHash.hasOwnProperty(field))) {
                        fieldHash[field]=0;
                    }
                    fieldHash[field] ^= (i + hashCode(item[field]));
                }
            }
        }

        for (field in fieldHash) {
            if (fieldHash.hasOwnProperty(field)) {
                hashField[fieldHash[field]] = field; //duplicates will overwrite
            }
        }

        //collect fields to use
        for (hash in hashField) {
            if (hashField.hasOwnProperty(hash)) {
                field = hashField[hash];
                fieldMap[field]=fieldCount;
                fields[fieldCount++] = {field: field, count: 0};
            }
        }

        //count field occurrences
        for (i=0; i<items.length; i++) {
            item=items[i];
            for (field in item) {
                if (item.hasOwnProperty(field) && 
                    (fieldMap.hasOwnProperty(field))) {
                    fields[fieldMap[field]].count++;
                }
            }
        }

        //build new fieldMap with common items first
        fields.sort(function (a,b) {return b.count-a.count;}); //descending
        fieldMap={};
        for (i=0; i<fields.length; i++) {
            fieldMap[fields[i].field] = i;
        }


        //translate each item to array using fieldMap
        for (i=0; i < items.length; i++) {
            item=items[i];
            row=[];
            for (field in item) {
                if (item.hasOwnProperty(field) && fieldMap.hasOwnProperty(field)) {
                    row[fieldMap[field]]=item[field];
                }
            }
            rows.push(row);
        }
        header=fields.map(function (info) {return info.count;});
        rows.unshift(header);
        return rows;
    },



    configForm = function (win) {
        var settings = {varying: []};
        var form;
        var result = $.Deferred();

        var getForm = function (done) {

            var parseForm = function (evt) {
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
        };

        var getVarying = function (done) {
            var deferred = $.Deferred();

            var receiveField = function (field) {
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
            };

            alert("Now click on fields you want to change as you scrape.  Click the escape key (esc) when done.");
            selectItem(win).done(receiveField);
        };

        var fillVarying = function (done) {

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
            };

            var i;
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
    },

    scrapeForm = function (form, settings) {
        var i,j;
        var formTask = function (i) {
            return function (done) {
                scrapeFormInstance(i, done);
            };
        };
        var scrapeFormInstance = function (i, done) {
            form.target="scraper"+i;
            for (j=0; j<settings.varying.length; j++) {
                form.find('input[name="' + settings.varying[i].name +'"]')
                    .val(settings.varying[j].values[i]);
            }
            form.submit();
            //set up task of scraping results
        };

        for (i=0; i<settings.varying[0].values.length; i++) {
            pacer.todo(formTask(i));
        }

    },

    scrapeUrls = function (urls, path, paginator, limit) { 
        var done = $.Deferred()
        , doneUrls = {}
        , scrapedItems=[]
        , seenHashes = {}
        , receiveScrape = function (items) {
            [].push.apply(scrapedItems,items);
        }

        , scrapeFrame = function (frame, limit, close) {
            var doneFrame = $.Deferred()
            , wrapUp = function () {
                doneFrame.resolve();
                if (close) { frame.close(); }
            }
            , scrapeOne = function () {
                var win = frame.contentWindow
                , doc = $(win.document)
                , anchor
                , hash = hashCode(doc.find('body').html());

                debug.log('loaded ' + win.location.href + " hash " + hash);
                
                if (seenHashes[hash]) {
                    wrapUp();
                } else {
                    seenHashes[hash]=true;
                    receiveScrape(shredPage(doc,path));

                    //feature: a negative limit will loop forever
                    //until no pagination link is found
                    //on some sites this may cause an infinite loop!
                    if (paginator && (limit-- !== 0) && 
                        (anchor = paginator(doc)).length > 0) {
                        debug.log("next button <" +
                                  anchor.eq(anchor.length-1).prop('tagName')+
                                  anchor.eq(anchor.length-1).attr('class')+
                                  ">"+
                                  anchor.eq(anchor.length-1).html()+
                                  "</"+
                                  anchor.eq(anchor.length-1).prop('tagName')+
                                  ">"
                                  );
                        //heuristic; use last match if have multiple
                        anchor.get(anchor.length-1).click(); 
                        setTimeout(scrapeOne, 2000);
                    } else {
                        wrapUp();
                    }
                }
            };
            
            debug.log("loading frame");
            frame.oneLoad(function () { 
                debug.log('scrape frame ' + frame.contentWindow.location.href);
                setTimeout(scrapeOne, 2000);//add some time for page's js to run
            });
            return doneFrame.promise();
        }

        , scrapeForm = function (form, fills) {
            forDeferred(function (i) {
                pacer.enqueue();
            },
                        0, fills.length);
        }

        , scrapeUrl = function (url, limit) {
            debug.log('scrape url ' + url);
            var frame = MyFrame.open(url);
            //use url as title so different pages don't overwrite same window
            return scrapeFrame(frame, limit, true);
        };

        forDeferred(function (i) {
            return scrapeUrl(urls[i], limit - 1);
        },0,urls.length)
            .done(function () {done.resolve(tabulate(scrapedItems));});
        return done.promise();
    },


    configScrape = function (elt) {

        if (elt===null) { return; }
        scrollTo(0,0);

        var path=describePath(elt,20);
        var term = MyFrame.open("", 'ConfigureScraper');
        var startDoc = elt.get(0).ownerDocument; //possibly in iframe
        var getSettings = function () {
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

            var handleInput = function () {
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
                    choosePaginator().done(function (paginator) {
                        done.resolve({urls: urls, paginator: paginator, 
                                      limit: limit});
                    });
                } else {
                    done.resolve({urls: urls});
                }
                urlForm.remove();
                term.close();
            };

            scrapeChoice.find('input[name="scrape-choice"]').change(function () {
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
        };


        var showResults = function (items) {
            var i, j, row, item, cell, 
            results=$("<table style='border-collapse:true;'></table>"),
            killer = $('<div><button id="kill-row">Kill Row</button><button id="kill-col">Kill Column</button></div>'),

            //function to remove one row from the table
            //removing the row will remove values from certain columns
            //if the columns become empty, we remove them
            killRow = function () {
                var target = killer.parent().parent(),
                header = target.siblings().eq(0).children(),
                deadCols=[];
                if (target.get(0).rowIndex > 0) { //don't delete header
                    killer.detach();
                    //update header counts and find now-empty columns
                    target.children().each(function (i) {
                        var count;
                        if ($(this).is(':not(:empty)')) {
                            count = parseInt(header.eq(i).text());
                            header.eq(i).text(count-1);
                            if (count === 1) {
                                deadCols.push(i);
                            }
                        }
                    });
                    //remove all empty columns
                    results.find('tr').each(function () {
                        var i, row=$(this).children();
                        for (i = deadCols.length-1; i>=0; i--) {
                            //count down to avoid changing indices
                            row.eq(deadCols[i]).remove();
                        }
                    });
                    target.remove();
                }
            },

            killCol = function () {
                var target = killer.parent().get(0), //td to remove
                row = killer.parent().parent(), //tr 
                targetIndex = -1,
                findMe = function (index) {
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
            ;

            //function showresults
            for (i=0; i<items.length; i++) {
                row=$('<tr></tr>');
                item=items[i];
                for (j=0; j<item.length; j++) {
                    cell=(i>0) ? $('<td></td>') : $('<th></th>');
                    cell.text(item[j]);
                    row.append(cell);
                }
                results.append(row);
            }
            var msg = MyFrame.open("",'ScraperResults');
            msg.oneLoad(function () {
                $(msg.contentWindow.document.body)
                    .append('<h2>Results</h2>')
                    .append("<style>td {border: 2px solid black}\n"
                           +"table {border-collapse: collapse}</style>")
                    .append(results);
                $('#kill-row',killer).click(killRow);
                $('#kill-col',killer).click(killCol);
                results.on('mouseenter',"td",function () {
                    $(this).prepend(killer);
                });
            });
            return;
        };

        $(path).css('background-color','red');
        getSettings().done(function (settings) {
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
    var main = function () {
        alert("Move the mouse to select an item.  Use the up-arrow key to widen the selection.  Hit return when done.");
        selectItem().done(configScrape);
    };

    var startIt = function () {
        $(document).ready(main);
    };

    var loadScript = function (script, cont) {
        var jsCode=document.createElement('script');
        jsCode.setAttribute('src',script);
        jsCode.onload = cont;
        document.body.appendChild(jsCode);
    };

    loadScript(document.location.protocol+"//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js",startIt);
}());
