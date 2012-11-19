/*


var x = eventually(f,a,b,c);
var y = eventually(g,p,q,r);
var z = eventually(h,x,y);

f,g,h are functions that call a continuation to pass back their results
want a method z.exec that will 
* try to evaluate z
* discover that two of the args are promises
* call one of them with a continuation that will call the other with a continuation that will evaluate z

z.followedBy(f) should compute z and pass the result to f

*/

var Deferred = function(f,args) {
    this.f = f;
    this.args = args;
}

Deferred.prototype.exec = function(cont) {
    var args = this.args;
    var f = this.f;
    var i=0;
    var advance = function() {
	if (i == args.length) {
	    var res=f.apply(null,args);
	    if (cont) {
		cont(res);
	    }
	} else if (!(args[i] instanceof Deferred)) {
	    i++;
	    advance();
	} else {
	    args[i].exec(function(val) {
		args[i] = val;
		i++;
		advance();
	    });
	}
    }
    advance();
}

var defer = function(f) {
    var absorber = function() {
	var args = Array.prototype.slice.call(arguments);
	return new Deferred(f,args);
    }
    return absorber;
}

var test=function() {

    var g = function(x,y) {return x+y};
    var h = function(a,b) {return a-b};

    var a = (defer(g))(3,4);
    var b = (defer(h))(a,2);
    var c = (defer(function(v) {alert(v);}))(b);
    c.exec();
}
