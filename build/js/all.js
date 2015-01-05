(function () {/**
 * @license almond 0.3.0 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("lib/almond", function(){});

/*! jQuery v2.1.3 | (c) 2005, 2014 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l=a.document,m="2.1.3",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return n.each(this,a,b)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){return!n.isArray(a)&&a-parseFloat(a)+1>=0},isPlainObject:function(a){return"object"!==n.type(a)||a.nodeType||n.isWindow(a)?!1:a.constructor&&!j.call(a.constructor.prototype,"isPrototypeOf")?!1:!0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=l.createElement("script"),b.text=a,l.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=s(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:g.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=s(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(e=d.call(arguments,2),f=function(){return a.apply(b||this,e.concat(d.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:k}),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function s(a){var b=a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=hb(),z=hb(),A=hb(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N=M.replace("w","w#"),O="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+N+"))|)"+L+"*\\]",P=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+O+")*)|.*)\\)|)",Q=new RegExp(L+"+","g"),R=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),S=new RegExp("^"+L+"*,"+L+"*"),T=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),U=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),V=new RegExp(P),W=new RegExp("^"+N+"$"),X={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M.replace("w","w*")+")"),ATTR:new RegExp("^"+O),PSEUDO:new RegExp("^"+P),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ab=/[+~]/,bb=/'|\\/g,cb=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),db=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},eb=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(fb){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function gb(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],k=b.nodeType,"string"!=typeof a||!a||1!==k&&9!==k&&11!==k)return d;if(!e&&p){if(11!==k&&(f=_.exec(a)))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return H.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName)return H.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=1!==k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(bb,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+rb(o[l]);w=ab.test(a)&&pb(b.parentNode)||b,x=o.join(",")}if(x)try{return H.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function hb(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ib(a){return a[u]=!0,a}function jb(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function kb(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function lb(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function mb(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function nb(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function ob(a){return ib(function(b){return b=+b,ib(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function pb(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=gb.support={},f=gb.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=gb.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=g.documentElement,e=g.defaultView,e&&e!==e.top&&(e.addEventListener?e.addEventListener("unload",eb,!1):e.attachEvent&&e.attachEvent("onunload",eb)),p=!f(g),c.attributes=jb(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=jb(function(a){return a.appendChild(g.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(g.getElementsByClassName),c.getById=jb(function(a){return o.appendChild(a).id=u,!g.getElementsByName||!g.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(g.querySelectorAll))&&(jb(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\f]' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),jb(function(a){var b=g.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&jb(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",P)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===g||a.ownerDocument===v&&t(v,a)?-1:b===g||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,h=[a],i=[b];if(!e||!f)return a===g?-1:b===g?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return lb(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?lb(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},g):n},gb.matches=function(a,b){return gb(a,null,null,b)},gb.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return gb(b,n,null,[a]).length>0},gb.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},gb.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},gb.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},gb.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=gb.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=gb.selectors={cacheLength:50,createPseudo:ib,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(cb,db),a[3]=(a[3]||a[4]||a[5]||"").replace(cb,db),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||gb.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&gb.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(cb,db).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=gb.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(Q," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||gb.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ib(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ib(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?ib(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ib(function(a){return function(b){return gb(a,b).length>0}}),contains:ib(function(a){return a=a.replace(cb,db),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ib(function(a){return W.test(a||"")||gb.error("unsupported lang: "+a),a=a.replace(cb,db).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:ob(function(){return[0]}),last:ob(function(a,b){return[b-1]}),eq:ob(function(a,b,c){return[0>c?c+b:c]}),even:ob(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:ob(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:ob(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:ob(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=mb(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=nb(b);function qb(){}qb.prototype=d.filters=d.pseudos,d.setFilters=new qb,g=gb.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?gb.error(a):z(a,i).slice(0)};function rb(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function sb(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function tb(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ub(a,b,c){for(var d=0,e=b.length;e>d;d++)gb(a,b[d],c);return c}function vb(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function wb(a,b,c,d,e,f){return d&&!d[u]&&(d=wb(d)),e&&!e[u]&&(e=wb(e,f)),ib(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ub(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:vb(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=vb(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=vb(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function xb(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=sb(function(a){return a===b},h,!0),l=sb(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[sb(tb(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return wb(i>1&&tb(m),i>1&&rb(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&xb(a.slice(i,e)),f>e&&xb(a=a.slice(e)),f>e&&rb(a))}m.push(c)}return tb(m)}function yb(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=F.call(i));s=vb(s)}H.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&gb.uniqueSort(i)}return k&&(w=v,j=t),r};return c?ib(f):f}return h=gb.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=xb(b[c]),f[u]?d.push(f):e.push(f);f=A(a,yb(e,d)),f.selector=a}return f},i=gb.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(cb,db),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(cb,db),ab.test(j[0].type)&&pb(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&rb(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,ab.test(a)&&pb(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=jb(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),jb(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||kb("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&jb(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||kb("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),jb(function(a){return null==a.getAttribute("disabled")})||kb(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),gb}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=n.expr.match.needsContext,v=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,w=/^.[^:#\[\.,]*$/;function x(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(w.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return g.call(b,a)>=0!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(x(this,a||[],!1))},not:function(a){return this.pushStack(x(this,a||[],!0))},is:function(a){return!!x(this,"string"==typeof a&&u.test(a)?n(a):a||[],!1).length}});var y,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=n.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||y).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:l,!0)),v.test(c[1])&&n.isPlainObject(b))for(c in b)n.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}return d=l.getElementById(c[2]),d&&d.parentNode&&(this.length=1,this[0]=d),this.context=l,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof y.ready?y.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};A.prototype=n.fn,y=n(l);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};n.extend({dir:function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=u.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.unique(f):f)},index:function(a){return a?"string"==typeof a?g.call(n(a),this[0]):g.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.unique(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(C[a]||n.unique(e),B.test(a)&&e.reverse()),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return n.each(a.match(E)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):n.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(b=a.memory&&l,c=!0,g=e||0,e=0,f=h.length,d=!0;h&&f>g;g++)if(h[g].apply(l[0],l[1])===!1&&a.stopOnFalse){b=!1;break}d=!1,h&&(i?i.length&&j(i.shift()):b?h=[]:k.disable())},k={add:function(){if(h){var c=h.length;!function g(b){n.each(b,function(b,c){var d=n.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&g(c)})}(arguments),d?f=h.length:b&&(e=c,j(b))}return this},remove:function(){return h&&n.each(arguments,function(a,b){var c;while((c=n.inArray(b,h,c))>-1)h.splice(c,1),d&&(f>=c&&f--,g>=c&&g--)}),this},has:function(a){return a?n.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],f=0,this},disable:function(){return h=i=b=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,b||k.disable(),this},locked:function(){return!i},fireWith:function(a,b){return!h||c&&!i||(b=b||[],b=[a,b.slice?b.slice():b],d?i.push(b):j(b)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!c}};return k},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&n.isFunction(a.promise)?e:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(H.resolveWith(l,[n]),n.fn.triggerHandler&&(n(l).triggerHandler("ready"),n(l).off("ready"))))}});function I(){l.removeEventListener("DOMContentLoaded",I,!1),a.removeEventListener("load",I,!1),n.ready()}n.ready.promise=function(b){return H||(H=n.Deferred(),"complete"===l.readyState?setTimeout(n.ready):(l.addEventListener("DOMContentLoaded",I,!1),a.addEventListener("load",I,!1))),H.promise(b)},n.ready.promise();var J=n.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)n.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f};n.acceptData=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function K(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=n.expando+K.uid++}K.uid=1,K.accepts=n.acceptData,K.prototype={key:function(a){if(!K.accepts(a))return 0;var b={},c=a[this.expando];if(!c){c=K.uid++;try{b[this.expando]={value:c},Object.defineProperties(a,b)}catch(d){b[this.expando]=c,n.extend(a,b)}}return this.cache[c]||(this.cache[c]={}),c},set:function(a,b,c){var d,e=this.key(a),f=this.cache[e];if("string"==typeof b)f[b]=c;else if(n.isEmptyObject(f))n.extend(this.cache[e],b);else for(d in b)f[d]=b[d];return f},get:function(a,b){var c=this.cache[this.key(a)];return void 0===b?c:c[b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=this.key(a),g=this.cache[f];if(void 0===b)this.cache[f]={};else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in g?d=[b,e]:(d=e,d=d in g?[d]:d.match(E)||[])),c=d.length;while(c--)delete g[d[c]]}},hasData:function(a){return!n.isEmptyObject(this.cache[a[this.expando]]||{})},discard:function(a){a[this.expando]&&delete this.cache[a[this.expando]]}};var L=new K,M=new K,N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(O,"-$1").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}M.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return M.hasData(a)||L.hasData(a)},data:function(a,b,c){return M.access(a,b,c)
},removeData:function(a,b){M.remove(a,b)},_data:function(a,b,c){return L.access(a,b,c)},_removeData:function(a,b){L.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=M.get(f),1===f.nodeType&&!L.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));L.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){M.set(this,a)}):J(this,function(b){var c,d=n.camelCase(a);if(f&&void 0===b){if(c=M.get(f,a),void 0!==c)return c;if(c=M.get(f,d),void 0!==c)return c;if(c=P(f,d,void 0),void 0!==c)return c}else this.each(function(){var c=M.get(this,d);M.set(this,d,b),-1!==a.indexOf("-")&&void 0!==c&&M.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){M.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=L.get(a,b),c&&(!d||n.isArray(c)?d=L.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return L.get(a,c)||L.access(a,c,{empty:n.Callbacks("once memory").add(function(){L.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=L.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var Q=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,R=["Top","Right","Bottom","Left"],S=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)},T=/^(?:checkbox|radio)$/i;!function(){var a=l.createDocumentFragment(),b=a.appendChild(l.createElement("div")),c=l.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var U="undefined";k.focusinBubbles="onfocusin"in a;var V=/^key/,W=/^(?:mouse|pointer|contextmenu)|click/,X=/^(?:focusinfocus|focusoutblur)$/,Y=/^([^.]*)(?:\.(.+)|)$/;function Z(){return!0}function $(){return!1}function _(){try{return l.activeElement}catch(a){}}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return typeof n!==U&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(E)||[""],j=b.length;while(j--)h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g,!1)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.hasData(a)&&L.get(a);if(r&&(i=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&(delete r.handle,L.remove(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,m,o,p=[d||l],q=j.call(b,"type")?b.type:b,r=j.call(b,"namespace")?b.namespace.split("."):[];if(g=h=d=d||l,3!==d.nodeType&&8!==d.nodeType&&!X.test(q+n.event.triggered)&&(q.indexOf(".")>=0&&(r=q.split("."),q=r.shift(),r.sort()),k=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=r.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},e||!o.trigger||o.trigger.apply(d,c)!==!1)){if(!e&&!o.noBubble&&!n.isWindow(d)){for(i=o.delegateType||q,X.test(i+q)||(g=g.parentNode);g;g=g.parentNode)p.push(g),h=g;h===(d.ownerDocument||l)&&p.push(h.defaultView||h.parentWindow||a)}f=0;while((g=p[f++])&&!b.isPropagationStopped())b.type=f>1?i:o.bindType||q,m=(L.get(g,"events")||{})[b.type]&&L.get(g,"handle"),m&&m.apply(g,c),m=k&&g[k],m&&m.apply&&n.acceptData(g)&&(b.result=m.apply(g,c),b.result===!1&&b.preventDefault());return b.type=q,e||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!n.acceptData(d)||k&&n.isFunction(d[q])&&!n.isWindow(d)&&(h=d[k],h&&(d[k]=null),n.event.triggered=q,d[q](),n.event.triggered=void 0,h&&(d[k]=h)),b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(L.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(g.namespace))&&(a.handleObj=g,a.data=g.data,e=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(a.result=e)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!==this;i=i.parentNode||this)if(i.disabled!==!0||"click"!==a.type){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>=0:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||l,d=c.documentElement,e=c.body,a.pageX=b.clientX+(d&&d.scrollLeft||e&&e.scrollLeft||0)-(d&&d.clientLeft||e&&e.clientLeft||0),a.pageY=b.clientY+(d&&d.scrollTop||e&&e.scrollTop||0)-(d&&d.clientTop||e&&e.clientTop||0)),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=W.test(e)?this.mouseHooks:V.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new n.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=l),3===a.target.nodeType&&(a.target=a.target.parentNode),g.filter?g.filter(a,f):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==_()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===_()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?Z:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=Z,a&&a.preventDefault&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=Z,a&&a.stopPropagation&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=Z,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=L.access(d,b);e||d.addEventListener(a,c,!0),L.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=L.access(d,b)-1;e?L.access(d,b,e):(d.removeEventListener(a,c,!0),L.remove(d,b))}}}),n.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(g in a)this.on(g,b,c,a[g],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=$;else if(!d)return this;return 1===e&&(f=d,d=function(a){return n().off(a),f.apply(this,arguments)},d.guid=f.guid||(f.guid=n.guid++)),this.each(function(){n.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=$),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var ab=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,bb=/<([\w:]+)/,cb=/<|&#?\w+;/,db=/<(?:script|style|link)/i,eb=/checked\s*(?:[^=]|=\s*.checked.)/i,fb=/^$|\/(?:java|ecma)script/i,gb=/^true\/(.*)/,hb=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ib={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ib.optgroup=ib.option,ib.tbody=ib.tfoot=ib.colgroup=ib.caption=ib.thead,ib.th=ib.td;function jb(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function kb(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function lb(a){var b=gb.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function mb(a,b){for(var c=0,d=a.length;d>c;c++)L.set(a[c],"globalEval",!b||L.get(b[c],"globalEval"))}function nb(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(L.hasData(a)&&(f=L.access(a),g=L.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}M.hasData(a)&&(h=M.access(a),i=n.extend({},h),M.set(b,i))}}function ob(a,b){var c=a.getElementsByTagName?a.getElementsByTagName(b||"*"):a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function pb(a,b){var c=b.nodeName.toLowerCase();"input"===c&&T.test(a.type)?b.checked=a.checked:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}n.extend({clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=ob(h),f=ob(a),d=0,e=f.length;e>d;d++)pb(f[d],g[d]);if(b)if(c)for(f=f||ob(a),g=g||ob(h),d=0,e=f.length;e>d;d++)nb(f[d],g[d]);else nb(a,h);return g=ob(h,"script"),g.length>0&&mb(g,!i&&ob(a,"script")),h},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,k=b.createDocumentFragment(),l=[],m=0,o=a.length;o>m;m++)if(e=a[m],e||0===e)if("object"===n.type(e))n.merge(l,e.nodeType?[e]:e);else if(cb.test(e)){f=f||k.appendChild(b.createElement("div")),g=(bb.exec(e)||["",""])[1].toLowerCase(),h=ib[g]||ib._default,f.innerHTML=h[1]+e.replace(ab,"<$1></$2>")+h[2],j=h[0];while(j--)f=f.lastChild;n.merge(l,f.childNodes),f=k.firstChild,f.textContent=""}else l.push(b.createTextNode(e));k.textContent="",m=0;while(e=l[m++])if((!d||-1===n.inArray(e,d))&&(i=n.contains(e.ownerDocument,e),f=ob(k.appendChild(e),"script"),i&&mb(f),c)){j=0;while(e=f[j++])fb.test(e.type||"")&&c.push(e)}return k},cleanData:function(a){for(var b,c,d,e,f=n.event.special,g=0;void 0!==(c=a[g]);g++){if(n.acceptData(c)&&(e=c[L.expando],e&&(b=L.cache[e]))){if(b.events)for(d in b.events)f[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);L.cache[e]&&delete L.cache[e]}delete M.cache[c[M.expando]]}}}),n.fn.extend({text:function(a){return J(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&(this.textContent=a)})},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=jb(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?n.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||n.cleanData(ob(c)),c.parentNode&&(b&&n.contains(c.ownerDocument,c)&&mb(ob(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(ob(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return J(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!db.test(a)&&!ib[(bb.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(ab,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(ob(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,n.cleanData(ob(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,m=this,o=l-1,p=a[0],q=n.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&eb.test(p))return this.each(function(c){var d=m.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(c=n.buildFragment(a,this[0].ownerDocument,!1,this),d=c.firstChild,1===c.childNodes.length&&(c=d),d)){for(f=n.map(ob(c,"script"),kb),g=f.length;l>j;j++)h=c,j!==o&&(h=n.clone(h,!0,!0),g&&n.merge(f,ob(h,"script"))),b.call(this[j],h,j);if(g)for(i=f[f.length-1].ownerDocument,n.map(f,lb),j=0;g>j;j++)h=f[j],fb.test(h.type||"")&&!L.access(h,"globalEval")&&n.contains(i,h)&&(h.src?n._evalUrl&&n._evalUrl(h.src):n.globalEval(h.textContent.replace(hb,"")))}return this}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),g=e.length-1,h=0;g>=h;h++)c=h===g?this:this.clone(!0),n(e[h])[b](c),f.apply(d,c.get());return this.pushStack(d)}});var qb,rb={};function sb(b,c){var d,e=n(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:n.css(e[0],"display");return e.detach(),f}function tb(a){var b=l,c=rb[a];return c||(c=sb(a,b),"none"!==c&&c||(qb=(qb||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=qb[0].contentDocument,b.write(),b.close(),c=sb(a,b),qb.detach()),rb[a]=c),c}var ub=/^margin/,vb=new RegExp("^("+Q+")(?!px)[a-z%]+$","i"),wb=function(b){return b.ownerDocument.defaultView.opener?b.ownerDocument.defaultView.getComputedStyle(b,null):a.getComputedStyle(b,null)};function xb(a,b,c){var d,e,f,g,h=a.style;return c=c||wb(a),c&&(g=c.getPropertyValue(b)||c[b]),c&&(""!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),vb.test(g)&&ub.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function yb(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d=l.documentElement,e=l.createElement("div"),f=l.createElement("div");if(f.style){f.style.backgroundClip="content-box",f.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===f.style.backgroundClip,e.style.cssText="border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute",e.appendChild(f);function g(){f.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",f.innerHTML="",d.appendChild(e);var g=a.getComputedStyle(f,null);b="1%"!==g.top,c="4px"===g.width,d.removeChild(e)}a.getComputedStyle&&n.extend(k,{pixelPosition:function(){return g(),b},boxSizingReliable:function(){return null==c&&g(),c},reliableMarginRight:function(){var b,c=f.appendChild(l.createElement("div"));return c.style.cssText=f.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",f.style.width="1px",d.appendChild(e),b=!parseFloat(a.getComputedStyle(c,null).marginRight),d.removeChild(e),f.removeChild(c),b}})}}(),n.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var zb=/^(none|table(?!-c[ea]).+)/,Ab=new RegExp("^("+Q+")(.*)$","i"),Bb=new RegExp("^([+-])=("+Q+")","i"),Cb={position:"absolute",visibility:"hidden",display:"block"},Db={letterSpacing:"0",fontWeight:"400"},Eb=["Webkit","O","Moz","ms"];function Fb(a,b){if(b in a)return b;var c=b[0].toUpperCase()+b.slice(1),d=b,e=Eb.length;while(e--)if(b=Eb[e]+c,b in a)return b;return d}function Gb(a,b,c){var d=Ab.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Hb(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+R[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+R[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+R[f]+"Width",!0,e))):(g+=n.css(a,"padding"+R[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+R[f]+"Width",!0,e)));return g}function Ib(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=wb(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=xb(a,b,f),(0>e||null==e)&&(e=a.style[b]),vb.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Hb(a,b,c||(g?"border":"content"),d,f)+"px"}function Jb(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=L.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&S(d)&&(f[g]=L.access(d,"olddisplay",tb(d.nodeName)))):(e=S(d),"none"===c&&e||L.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=xb(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Fb(i,h)),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=Bb.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(n.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||n.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Fb(a.style,h)),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=xb(a,b,d)),"normal"===e&&b in Db&&(e=Db[b]),""===c||c?(f=parseFloat(e),c===!0||n.isNumeric(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?zb.test(n.css(a,"display"))&&0===a.offsetWidth?n.swap(a,Cb,function(){return Ib(a,b,d)}):Ib(a,b,d):void 0},set:function(a,c,d){var e=d&&wb(a);return Gb(a,c,d?Hb(a,b,d,"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),n.cssHooks.marginRight=yb(k.reliableMarginRight,function(a,b){return b?n.swap(a,{display:"inline-block"},xb,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+R[d]+b]=f[d]||f[d-2]||f[0];return e}},ub.test(a)||(n.cssHooks[a+b].set=Gb)}),n.fn.extend({css:function(a,b){return J(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=wb(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Jb(this,!0)},hide:function(){return Jb(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){S(this)?n(this).show():n(this).hide()})}});function Kb(a,b,c,d,e){return new Kb.prototype.init(a,b,c,d,e)}n.Tween=Kb,Kb.prototype={constructor:Kb,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Kb.propHooks[this.prop];return a&&a.get?a.get(this):Kb.propHooks._default.get(this)},run:function(a){var b,c=Kb.propHooks[this.prop];return this.pos=b=this.options.duration?n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Kb.propHooks._default.set(this),this}},Kb.prototype.init.prototype=Kb.prototype,Kb.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Kb.propHooks.scrollTop=Kb.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.fx=Kb.prototype.init,n.fx.step={};var Lb,Mb,Nb=/^(?:toggle|show|hide)$/,Ob=new RegExp("^(?:([+-])=|)("+Q+")([a-z%]*)$","i"),Pb=/queueHooks$/,Qb=[Vb],Rb={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=Ob.exec(b),f=e&&e[3]||(n.cssNumber[a]?"":"px"),g=(n.cssNumber[a]||"px"!==f&&+d)&&Ob.exec(n.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,n.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function Sb(){return setTimeout(function(){Lb=void 0}),Lb=n.now()}function Tb(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=R[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ub(a,b,c){for(var d,e=(Rb[b]||[]).concat(Rb["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Vb(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&S(a),q=L.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?L.get(a,"olddisplay")||tb(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Nb.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?tb(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=L.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;L.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ub(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function Wb(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Xb(a,b,c){var d,e,f=0,g=Qb.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=Lb||Sb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:Lb||Sb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Wb(k,j.opts.specialEasing);g>f;f++)if(d=Qb[f].call(j,a,k,j.opts))return d;return n.map(k,Ub,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(Xb,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Rb[c]=Rb[c]||[],Rb[c].unshift(b)},prefilter:function(a,b){b?Qb.unshift(a):Qb.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(S).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Xb(this,n.extend({},a),f);(e||L.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=L.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Pb.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=L.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Tb(b,!0),a,d,e)}}),n.each({slideDown:Tb("show"),slideUp:Tb("hide"),slideToggle:Tb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(Lb=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),Lb=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Mb||(Mb=setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){clearInterval(Mb),Mb=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a=l.createElement("input"),b=l.createElement("select"),c=b.appendChild(l.createElement("option"));a.type="checkbox",k.checkOn=""!==a.value,k.optSelected=c.selected,b.disabled=!0,k.optDisabled=!c.disabled,a=l.createElement("input"),a.value="t",a.type="radio",k.radioValue="t"===a.value}();var Yb,Zb,$b=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return J(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===U?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),d=n.attrHooks[b]||(n.expr.match.bool.test(b)?Zb:Yb)),void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=n.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void n.removeAttr(a,b))
},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),Zb={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=$b[b]||n.find.attr;$b[b]=function(a,b,d){var e,f;return d||(f=$b[b],$b[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,$b[b]=f),e}});var _b=/^(?:input|select|textarea|button)$/i;n.fn.extend({prop:function(a,b){return J(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!n.isXMLDoc(a),f&&(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){return a.hasAttribute("tabindex")||_b.test(a.nodeName)||a.href?a.tabIndex:-1}}}}),k.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var ac=/[\t\r\n\f]/g;n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h="string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=n.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0===arguments.length||"string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ac," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?n.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(n.isFunction(a)?function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=n(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===U||"boolean"===c)&&(this.className&&L.set(this,"__className__",this.className),this.className=this.className||a===!1?"":L.get(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ac," ").indexOf(b)>=0)return!0;return!1}});var bc=/\r/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(bc,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(d.value,f)>=0)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}},k.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var cc=n.now(),dc=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(a){var b,c;if(!a||"string"!=typeof a)return null;try{c=new DOMParser,b=c.parseFromString(a,"text/xml")}catch(d){b=void 0}return(!b||b.getElementsByTagName("parsererror").length)&&n.error("Invalid XML: "+a),b};var ec=/#.*$/,fc=/([?&])_=[^&]*/,gc=/^(.*?):[ \t]*([^\r\n]*)$/gm,hc=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,ic=/^(?:GET|HEAD)$/,jc=/^\/\//,kc=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,lc={},mc={},nc="*/".concat("*"),oc=a.location.href,pc=kc.exec(oc.toLowerCase())||[];function qc(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function rc(a,b,c,d){var e={},f=a===mc;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function sc(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function tc(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function uc(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:oc,type:"GET",isLocal:hc.test(pc[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":nc,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?sc(sc(a,n.ajaxSettings),b):sc(n.ajaxSettings,a)},ajaxPrefilter:qc(lc),ajaxTransport:qc(mc),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=n.ajaxSetup({},b),l=k.context||k,m=k.context&&(l.nodeType||l.jquery)?n(l):n.event,o=n.Deferred(),p=n.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!f){f={};while(b=gc.exec(e))f[b[1].toLowerCase()]=b[2]}b=f[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?e:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return c&&c.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||oc)+"").replace(ec,"").replace(jc,pc[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=n.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(h=kc.exec(k.url.toLowerCase()),k.crossDomain=!(!h||h[1]===pc[1]&&h[2]===pc[2]&&(h[3]||("http:"===h[1]?"80":"443"))===(pc[3]||("http:"===pc[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=n.param(k.data,k.traditional)),rc(lc,k,b,v),2===t)return v;i=n.event&&k.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!ic.test(k.type),d=k.url,k.hasContent||(k.data&&(d=k.url+=(dc.test(d)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=fc.test(d)?d.replace(fc,"$1_="+cc++):d+(dc.test(d)?"&":"?")+"_="+cc++)),k.ifModified&&(n.lastModified[d]&&v.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&v.setRequestHeader("If-None-Match",n.etag[d])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+nc+"; q=0.01":""):k.accepts["*"]);for(j in k.headers)v.setRequestHeader(j,k.headers[j]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(j in{success:1,error:1,complete:1})v[j](k[j]);if(c=rc(mc,k,b,v)){v.readyState=1,i&&m.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,c.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,f,h){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),c=void 0,e=h||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,f&&(u=tc(k,v,f)),u=uc(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=v.getResponseHeader("etag"),w&&(n.etag[d]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,i&&m.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),i&&(m.trigger("ajaxComplete",[v,k]),--n.active||n.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return this.each(n.isFunction(a)?function(b){n(this).wrapInner(a.call(this,b))}:function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var vc=/%20/g,wc=/\[\]$/,xc=/\r?\n/g,yc=/^(?:submit|button|image|reset|file)$/i,zc=/^(?:input|select|textarea|keygen)/i;function Ac(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||wc.test(a)?d(a,e):Ac(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Ac(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Ac(c,a[c],b,e);return d.join("&").replace(vc,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&zc.test(this.nodeName)&&!yc.test(a)&&(this.checked||!T.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(xc,"\r\n")}}):{name:b.name,value:c.replace(xc,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(a){}};var Bc=0,Cc={},Dc={0:200,1223:204},Ec=n.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in Cc)Cc[a]()}),k.cors=!!Ec&&"withCredentials"in Ec,k.ajax=Ec=!!Ec,n.ajaxTransport(function(a){var b;return k.cors||Ec&&!a.crossDomain?{send:function(c,d){var e,f=a.xhr(),g=++Bc;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)f.setRequestHeader(e,c[e]);b=function(a){return function(){b&&(delete Cc[g],b=f.onload=f.onerror=null,"abort"===a?f.abort():"error"===a?d(f.status,f.statusText):d(Dc[f.status]||f.status,f.statusText,"string"==typeof f.responseText?{text:f.responseText}:void 0,f.getAllResponseHeaders()))}},f.onload=b(),f.onerror=b("error"),b=Cc[g]=b("abort");try{f.send(a.hasContent&&a.data||null)}catch(h){if(b)throw h}},abort:function(){b&&b()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(d,e){b=n("<script>").prop({async:!0,charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&e("error"===a.type?404:200,a.type)}),l.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Fc=[],Gc=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Fc.pop()||n.expando+"_"+cc++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Gc.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Gc.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Gc,"$1"+e):b.jsonp!==!1&&(b.url+=(dc.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Fc.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||l;var d=v.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=n.buildFragment([a],b,e),e&&e.length&&n(e).remove(),n.merge([],d.childNodes))};var Hc=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Hc)return Hc.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e,dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,f||[a.responseText,b,a])}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};var Ic=a.document.documentElement;function Jc(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(typeof d.getBoundingClientRect!==U&&(e=d.getBoundingClientRect()),c=Jc(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||Ic;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Ic})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(b,c){var d="pageYOffset"===c;n.fn[b]=function(e){return J(this,function(b,e,f){var g=Jc(b);return void 0===f?g?g[c]:b[e]:void(g?g.scrollTo(d?a.pageXOffset:f,d?f:a.pageYOffset):b[e]=f)},b,e,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=yb(k.pixelPosition,function(a,c){return c?(c=xb(a,b),vb.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return J(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Kc=a.jQuery,Lc=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Lc),b&&a.jQuery===n&&(a.jQuery=Kc),n},typeof b===U&&(a.jQuery=a.$=n),n});
//# sourceMappingURL=jquery.min.map;
/*
*
*   Extend r1
*
*   @author Yuji Ito @110chang
*
*/

define('mod/extend',[], function() {
  function extend() {
    var i, l, o, p, prop;

    o = Array.prototype.shift.call(arguments);
    l = arguments.length;

    if (l < 1 || o == null) {
      return o;
    }
    for (i = 0; i < l; i++) {
      p = arguments[i];
      for (prop in p) {
        o[prop] = p[prop];
      }
    }
    return o;
  }
  
  return extend;
});

/*
*
*   Screen r3
*
*   @author Yuji Ito @110chang
*
*/

define('mod/screen',[
  'mod/extend'
], function(extend) {
  function Screen() {
    if (!(this instanceof Screen)) {
      return new Screen();
    }
  }
  extend(Screen.prototype, {
    width: function() {
      return this.clientWidth();
    },
    height: function() {
      return this.clientHeight();
    },
    scrollWidth: function() {
      return Math.max.apply(null, [
        document.body.clientWidth,
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth
      ]);
    },
    scrollHeight: function() {
      // Ref. http://css-eblog.com/javascript/javascript-contents-height.html
      return Math.max.apply(null, [
        document.body.clientHeight,
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.documentElement.clientHeight
      ]);
    },
    scrollTop: function() {
      return document.documentElement.scrollTop || document.body.scrollTop;
    },
    scrollLeft: function() {
      return document.documentElement.scrollLeft || document.body.scrollLeft;
    },
    clientWidth: function() {
      return document.clientWidth || document.documentElement.clientWidth;
    },
    clientHeight: function() {
      return document.clientHeight || document.documentElement.clientHeight;
    }
  });
  
  return Screen;
});

/*
*
*   Inherit r2
*
*   @author Yuji Ito @110chang
*
*/

define('mod/inherit',[], function() {
  function inherit(d, b) {
    if (d == null || b == null) {
      return d;
    }
    var F = function() {};
    F.prototype = b.prototype;
    d.prototype = new F();
    d.prototype.constructor = d;
    return d;
  }
  
  return inherit;
});

/*
*
*   PubSub r2
*
*   @author Yuji Ito @110chang
*   via "Learning JavaScript Design Patterns" by Addy Osmani
*
*/

define('mod/pubsub',[
  'mod/extend'
], function(extend) {
  var _uid = -1;

  function PubSub() {
    if (!(this instanceof PubSub)) {
      return new PubSub();
    }
    this.topics = {};
  }
  extend(PubSub.prototype, {
    topics: {},
    publish: function(topic, args) {
      if (!this.topics[topic]) {
        return false;
      }
      
      var subscribers = this.topics[topic],
        len = subscribers ? subscribers.length : 0,
        context, func;
      
      while (len--) {
        context = subscribers[len].context || undefined;
        func = subscribers[len].func;
        
        if (context === undefined) {
          func(topic, args);
        } else {
          context[func].call(context, topic, args);
        }
      }
    },
    subscribe: function(topic, func, context) {
      if (!this.topics[topic]) {
        this.topics[topic] = [];
      }
      
      var token = (++_uid) + '',
        subscriber = {};
      //console.log(_uid);
      if (typeof func === 'string' && context !== undefined) {
        subscriber = {
          token: token,
          context: context,
          func: func
        };
      } else if (typeof func === 'function') {
        subscriber = {
          token: token,
          func: func
        };
      }
      
      this.topics[topic].push(subscriber);
      
      return token;
    },
    unsubscribe: function() {
      var m, i = 0, token;
      
      if (arguments.length === 1) {
        token = arguments[0];
        
        for (m in this.topics) {
          if (this.topics[m]) {
            for (; i < this.topics[m].length; i++) {
              if (this.topics[m][i].token === token) {
                this.topics[m].splice(i, 1);
                
                return token;
              }
            }
          }
        }
      } else if (arguments.length === 2) {
        var topic = arguments[0],
          func = arguments[1];
        
        if (this.topics[topic]) {
          for (; i < this.topics[topic].length; i++) {
            if (this.topics[topic][i].func === func) {
              this.topics[topic].splice(i, 1);
              
              return token;
            }
          }
        }
      }
      return this;
    },
    // short hands
    pub: this.publish,
    sub: this.subscribe,
    unsub: this.unsubscribe
  });

  return PubSub;
});

/*
*
*   Timer r2
*
*   @author Yuji Ito @110chang
*
*/

define('mod/timer',[
  'jquery',
  'mod/extend',
  'mod/inherit',
  'mod/pubsub'
], function($, extend, inherit, PubSub) {

  function Timer(duration, repeat) {
    if (!(this instanceof Timer)) {
      return new Timer(duration, repeat);
    }
    duration = duration == null ? 10000 : duration;
    repeat = repeat == null ? 0 : repeat;

    if (typeof duration !== 'number' || typeof repeat !== 'number') {
      throw new Error('Arguments must be Number.');
    }
    PubSub.call(this);
    this.duration = duration;
    this.repeat = repeat;
    this.count = -1;
  }
  inherit(Timer, PubSub);
    
  Timer.TIMER       = 'onTimer';
  Timer.TIMER_START = 'onTimerStart';
  Timer.TIMER_STOP  = 'onTimerStop';

  extend(Timer.prototype, {
    duration  : 0,
    timer     : null,
    repeat    : 0,
    count     : 0,
    startTime : null,
    stopTime  : null,
    
    start: function() {
      clearInterval(this.timer);

      this.count = this.repeat;
      this.timer = setInterval($.proxy(this._onTimerHandler, this), this.duration);
      this.startTime = (new Date()).getTime();
      this.stopTime = null;
      
      this.publish(Timer.TIMER_START, { time: this.startTime });
      
      return this;
    },
    stop: function() {
      clearInterval(this.timer);
      
      this.timer = null;
      this.stopTime = (new Date()).getTime();
      
      this.publish(Timer.TIMER_STOP, { time: this.stopTime });
      
      return this;
    },
    _onTimerHandler: function() {
      this.count--;
      this.publish(Timer.TIMER, { count: this.count, time: (new Date()).getTime() });

      if (this.repeat > -1 && this.count < 1) {
        this.stop();
      }
    }
  });
  
  return Timer;
});

/*
*
*   App/Configuration
*
*   @author Yuji Ito @110chang
*
*/

define('app/cnf',[], function() {
  return {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
    SCALE: 1,

    devOptions: {
      enableSleeping: true,
      render: {
        options: {
          wireframes: true,
          //background: '#39F',
          showSleeping: true,
          showAngleIndicator: true,
          showVelocity: true,
          showCollisions: true,
          //showIds: true
        }
      }
    },
    prodOptions: {
      enableSleeping: true,
      render: {
        options: {
          wireframes: false,
          background: '#39F',
          showSleeping: false
        }
      }
    }
  };
});

/**
* matter-0.8.0.min.js 0.8.0-alpha 2014-05-04
* http://brm.io/matter-js/
* License: MIT
*/

!function(){var a={},b={};!function(){var a=1;b.create=function(a){var b={id:o.nextId(),type:"body",label:"Body",angle:0,vertices:z.fromPath("L 0 0 L 40 0 L 40 40 L 0 40"),position:{x:0,y:0},force:{x:0,y:0},torque:0,positionImpulse:{x:0,y:0},constraintImpulse:{x:0,y:0,angle:0},speed:0,angularSpeed:0,velocity:{x:0,y:0},angularVelocity:0,isStatic:!1,isSleeping:!1,motion:0,sleepThreshold:60,density:.001,restitution:0,friction:.1,frictionAir:.01,groupId:0,slop:.05,timeScale:1,render:{visible:!0,sprite:{xScale:1,yScale:1},lineWidth:1.5}},d=o.extend(b,a);return c(d),d},b.nextGroupId=function(){return a++};var c=function(a){a.axes=a.axes||w.fromVertices(a.vertices),a.area=z.area(a.vertices),a.bounds=x.create(a.vertices),a.mass=a.mass||a.density*a.area,a.inverseMass=1/a.mass,a.inertia=a.inertia||z.inertia(a.vertices,a.mass),a.inverseInertia=1/a.inertia,a.positionPrev=a.positionPrev||{x:a.position.x,y:a.position.y},a.anglePrev=a.anglePrev||a.angle,a.render.fillStyle=a.render.fillStyle||(a.isStatic?"#eeeeee":o.choose(["#556270","#4ECDC4","#C7F464","#FF6B6B","#C44D58"])),a.render.strokeStyle=a.render.strokeStyle||o.shadeColor(a.render.fillStyle,-20),z.create(a.vertices,a);var c=z.centre(a.vertices);z.translate(a.vertices,a.position),z.translate(a.vertices,c,-1),z.rotate(a.vertices,a.angle,a.position),w.rotate(a.axes,a.angle),x.update(a.bounds,a.vertices,a.velocity),b.setStatic(a,a.isStatic),t.set(a,a.isSleeping)};b.setStatic=function(a,b){a.isStatic=b,b&&(a.restitution=0,a.friction=1,a.mass=a.inertia=a.density=1/0,a.inverseMass=a.inverseInertia=0,a.render.lineWidth=1,a.positionPrev.x=a.position.x,a.positionPrev.y=a.position.y,a.anglePrev=a.angle,a.angularVelocity=0,a.speed=0,a.angularSpeed=0,a.motion=0)},b.resetForcesAll=function(a){for(var b=0;b<a.length;b++){var c=a[b];c.force.x=0,c.force.y=0,c.torque=0}},b.applyGravityAll=function(a,b){for(var c=0;c<a.length;c++){var d=a[c];d.isStatic||d.isSleeping||(d.force.y+=d.mass*b.y*.001,d.force.x+=d.mass*b.x*.001)}},b.updateAll=function(a,c,d,e,f){for(var g=0;g<a.length;g++){var h=a[g];h.isStatic||h.isSleeping||h.bounds.max.x<f.min.x||h.bounds.min.x>f.max.x||h.bounds.max.y<f.min.y||h.bounds.min.y>f.max.y||b.update(h,c,d,e)}},b.update=function(a,b,c,d){var e=Math.pow(b*c*a.timeScale,2),f=1-a.frictionAir*c*a.timeScale,g=a.position.x-a.positionPrev.x,h=a.position.y-a.positionPrev.y;a.velocity.x=g*f*d+a.force.x/a.mass*e,a.velocity.y=h*f*d+a.force.y/a.mass*e,a.positionPrev.x=a.position.x,a.positionPrev.y=a.position.y,a.position.x+=a.velocity.x,a.position.y+=a.velocity.y,a.angularVelocity=(a.angle-a.anglePrev)*f*d+a.torque/a.inertia*e,a.anglePrev=a.angle,a.angle+=a.angularVelocity,a.speed=y.magnitude(a.velocity),a.angularSpeed=Math.abs(a.angularVelocity),z.translate(a.vertices,a.velocity),0!==a.angularVelocity&&(z.rotate(a.vertices,a.angularVelocity,a.position),w.rotate(a.axes,a.angularVelocity)),x.update(a.bounds,a.vertices,a.velocity)},b.applyForce=function(a,b,c){a.force.x+=c.x,a.force.y+=c.y;var d={x:b.x-a.position.x,y:b.y-a.position.y};a.torque+=(d.x*c.y-d.y*c.x)*a.inverseInertia},b.translate=function(a,b){a.positionPrev.x+=b.x,a.positionPrev.y+=b.y,a.position.x+=b.x,a.position.y+=b.y,z.translate(a.vertices,b),x.update(a.bounds,a.vertices,a.velocity)},b.rotate=function(a,b){a.anglePrev+=b,a.angle+=b,z.rotate(a.vertices,b,a.position),w.rotate(a.axes,b),x.update(a.bounds,a.vertices,a.velocity)},b.scale=function(a,b,c,d){z.scale(a.vertices,b,c,d),a.axes=w.fromVertices(a.vertices),a.area=z.area(a.vertices),a.mass=a.density*a.area,a.inverseMass=1/a.mass,z.translate(a.vertices,{x:-a.position.x,y:-a.position.y}),a.inertia=z.inertia(a.vertices,a.mass),a.inverseInertia=1/a.inertia,z.translate(a.vertices,{x:a.position.x,y:a.position.y}),x.update(a.bounds,a.vertices,a.velocity)}}();var c={};!function(){c.create=function(a){return o.extend({id:o.nextId(),type:"composite",parent:null,isModified:!1,bodies:[],constraints:[],composites:[],label:"Composite"},a)},c.setModified=function(a,b,d,e){if(a.isModified=b,d&&a.parent&&c.setModified(a.parent,b,d,e),e)for(var f=0;f<a.composites.length;f++){var g=a.composites[f];c.setModified(g,b,d,e)}},c.add=function(a,b){for(var d=[].concat(b),e=0;e<d.length;e++){var f=d[e];switch(f.type){case"body":c.addBody(a,f);break;case"constraint":c.addConstraint(a,f);break;case"composite":c.addComposite(a,f);break;case"mouseConstraint":c.addConstraint(a,f.constraint)}}return a},c.remove=function(a,b,d){for(var e=[].concat(b),f=0;f<e.length;f++){var g=e[f];switch(g.type){case"body":c.removeBody(a,g,d);break;case"constraint":c.removeConstraint(a,g,d);break;case"composite":c.removeComposite(a,g,d);break;case"mouseConstraint":c.removeConstraint(a,g.constraint)}}return a},c.addComposite=function(a,b){return a.composites.push(b),b.parent=a,c.setModified(a,!0,!0,!1),a},c.removeComposite=function(a,b,d){var e=a.composites.indexOf(b);if(-1!==e&&(c.removeCompositeAt(a,e),c.setModified(a,!0,!0,!1)),d)for(var f=0;f<a.composites.length;f++)c.removeComposite(a.composites[f],b,!0);return a},c.removeCompositeAt=function(a,b){return a.composites.splice(b,1),c.setModified(a,!0,!0,!1),a},c.addBody=function(a,b){return a.bodies.push(b),c.setModified(a,!0,!0,!1),a},c.removeBody=function(a,b,d){var e=a.bodies.indexOf(b);if(-1!==e&&(c.removeBodyAt(a,e),c.setModified(a,!0,!0,!1)),d)for(var f=0;f<a.composites.length;f++)c.removeBody(a.composites[f],b,!0);return a},c.removeBodyAt=function(a,b){return a.bodies.splice(b,1),c.setModified(a,!0,!0,!1),a},c.addConstraint=function(a,b){return a.constraints.push(b),c.setModified(a,!0,!0,!1),a},c.removeConstraint=function(a,b,d){var e=a.constraints.indexOf(b);if(-1!==e&&c.removeConstraintAt(a,e),d)for(var f=0;f<a.composites.length;f++)c.removeConstraint(a.composites[f],b,!0);return a},c.removeConstraintAt=function(a,b){return a.constraints.splice(b,1),c.setModified(a,!0,!0,!1),a},c.clear=function(a,b,d){if(d)for(var e=0;e<a.composites.length;e++)c.clear(a.composites[e],b,!0);return b?a.bodies=a.bodies.filter(function(a){return a.isStatic}):a.bodies.length=0,a.constraints.length=0,a.composites.length=0,c.setModified(a,!0,!0,!1),a},c.allBodies=function(a){for(var b=[].concat(a.bodies),d=0;d<a.composites.length;d++)b=b.concat(c.allBodies(a.composites[d]));return b},c.allConstraints=function(a){for(var b=[].concat(a.constraints),d=0;d<a.composites.length;d++)b=b.concat(c.allConstraints(a.composites[d]));return b},c.allComposites=function(a){for(var b=[].concat(a.composites),d=0;d<a.composites.length;d++)b=b.concat(c.allComposites(a.composites[d]));return b},c.get=function(a,b,d){var e,f;switch(d){case"body":e=c.allBodies(a);break;case"constraint":e=c.allConstraints(a);break;case"composite":e=c.allComposites(a).concat(a)}return e?(f=e.filter(function(a){return a.id.toString()===b.toString()}),0===f.length?null:f[0]):null},c.move=function(a,b,d){return c.remove(a,b),c.add(d,b),a},c.rebase=function(a){for(var b=c.allBodies(a).concat(c.allConstraints(a)).concat(c.allComposites(a)),d=0;d<b.length;d++)b[d].id=o.nextId();return c.setModified(a,!0,!0,!1),a}}();var d={};!function(){d.create=function(a){var b=c.create(),d={label:"World",gravity:{x:0,y:1},bounds:{min:{x:0,y:0},max:{x:800,y:600}}};return o.extend(b,d,a)}}();var e={};!function(){e.create=function(a){return{id:e.id(a),vertex:a,normalImpulse:0,tangentImpulse:0}},e.id=function(a){return a.body.id+"_"+a.index}}();var f={};!function(){f.collisions=function(a,b){for(var c=[],d=b.metrics,e=b.pairs.table,f=0;f<a.length;f++){var g=a[f][0],i=a[f][1];if(!(g.groupId&&i.groupId&&g.groupId===i.groupId||(g.isStatic||g.isSleeping)&&(i.isStatic||i.isSleeping)||(d.midphaseTests+=1,!x.overlaps(g.bounds,i.bounds)))){var j,k=h.id(g,i),m=e[k];j=m&&m.isActive?m.collision:null;var n=l.collides(g,i,j);d.narrowphaseTests+=1,n.reused&&(d.narrowReuseCount+=1),n.collided&&(c.push(n),d.narrowDetections+=1)}}return c},f.bruteForce=function(a,b){for(var c=[],d=b.metrics,e=b.pairs.table,f=0;f<a.length;f++)for(var g=f+1;g<a.length;g++){var i=a[f],j=a[g];if(!(i.groupId&&j.groupId&&i.groupId===j.groupId||(i.isStatic||i.isSleeping)&&(j.isStatic||j.isSleeping)||(d.midphaseTests+=1,!x.overlaps(i.bounds,j.bounds)))){var k,m=h.id(i,j),n=e[m];k=n&&n.isActive?n.collision:null;var o=l.collides(i,j,k);d.narrowphaseTests+=1,o.reused&&(d.narrowReuseCount+=1),o.collided&&(c.push(o),d.narrowDetections+=1)}}return c}}();var g={};!function(){g.create=function(a,b){return{buckets:{},pairs:{},pairsList:[],bucketWidth:a||48,bucketHeight:b||48}},g.update=function(c,g,h,k){var l,m,n,o,p,q=h.world,r=c.buckets,s=h.metrics,t=!1;for(s.broadphaseTests=0,l=0;l<g.length;l++){var u=g[l];if((!u.isSleeping||k)&&!(u.bounds.max.x<0||u.bounds.min.x>q.bounds.width||u.bounds.max.y<0||u.bounds.min.y>q.bounds.height)){var v=b(c,u);if(!u.region||v.id!==u.region.id||k){s.broadphaseTests+=1,(!u.region||k)&&(u.region=v);var w=a(v,u.region);for(m=w.startCol;m<=w.endCol;m++)for(n=w.startRow;n<=w.endRow;n++){p=d(m,n),o=r[p];var x=m>=v.startCol&&m<=v.endCol&&n>=v.startRow&&n<=v.endRow,y=m>=u.region.startCol&&m<=u.region.endCol&&n>=u.region.startRow&&n<=u.region.endRow;!x&&y&&y&&o&&i(c,o,u),(u.region===v||x&&!y||k)&&(o||(o=e(r,p)),f(c,o,u))}u.region=v,t=!0}}}t&&(c.pairsList=j(c))},g.clear=function(a){a.buckets={},a.pairs={},a.pairsList=[]};var a=function(a,b){var d=Math.min(a.startCol,b.startCol),e=Math.max(a.endCol,b.endCol),f=Math.min(a.startRow,b.startRow),g=Math.max(a.endRow,b.endRow);return c(d,e,f,g)},b=function(a,b){var d=b.bounds,e=Math.floor(d.min.x/a.bucketWidth),f=Math.floor(d.max.x/a.bucketWidth),g=Math.floor(d.min.y/a.bucketHeight),h=Math.floor(d.max.y/a.bucketHeight);return c(e,f,g,h)},c=function(a,b,c,d){return{id:a+","+b+","+c+","+d,startCol:a,endCol:b,startRow:c,endRow:d}},d=function(a,b){return a+","+b},e=function(a,b){var c=a[b]=[];return c},f=function(a,b,c){for(var d=0;d<b.length;d++){var e=b[d];if(!(c.id===e.id||c.isStatic&&e.isStatic)){var f=h.id(c,e),g=a.pairs[f];g?g[2]+=1:a.pairs[f]=[c,e,1]}}b.push(c)},i=function(a,b,c){b.splice(b.indexOf(c),1);for(var d=0;d<b.length;d++){var e=b[d],f=h.id(c,e),g=a.pairs[f];g&&(g[2]-=1)}},j=function(a){var b,c,d=[];b=o.keys(a.pairs);for(var e=0;e<b.length;e++)c=a.pairs[b[e]],c[2]>0?d.push(c):delete a.pairs[b[e]];return d}}();var h={};!function(){h.create=function(a,b){var c=a.bodyA,d=a.bodyB,e={id:h.id(c,d),bodyA:c,bodyB:d,contacts:{},activeContacts:[],separation:0,isActive:!0,timeCreated:b,timeUpdated:b,inverseMass:c.inverseMass+d.inverseMass,friction:Math.min(c.friction,d.friction),restitution:Math.max(c.restitution,d.restitution),slop:Math.max(c.slop,d.slop)};return h.update(e,a,b),e},h.update=function(a,b,c){var d=a.contacts,f=b.supports,g=a.activeContacts;if(a.collision=b,g.length=0,b.collided){for(var i=0;i<f.length;i++){var j=f[i],k=e.id(j),l=d[k];g.push(l?l:d[k]=e.create(j))}a.separation=b.depth,h.setActive(a,!0,c)}else a.isActive===!0&&h.setActive(a,!1,c)},h.setActive=function(a,b,c){b?(a.isActive=!0,a.timeUpdated=c):(a.isActive=!1,a.activeContacts.length=0)},h.id=function(a,b){return a.id<b.id?a.id+"_"+b.id:b.id+"_"+a.id}}();var i={};!function(){var a=1e3;i.create=function(a){return o.extend({table:{},list:[],collisionStart:[],collisionActive:[],collisionEnd:[]},a)},i.update=function(a,b,c){var d,e,f,g,i=a.list,j=a.table,k=a.collisionStart,l=a.collisionEnd,m=a.collisionActive,n=[];for(k.length=0,l.length=0,m.length=0,g=0;g<b.length;g++)d=b[g],d.collided&&(e=h.id(d.bodyA,d.bodyB),n.push(e),f=j[e],f?(f.isActive?m.push(f):k.push(f),h.update(f,d,c)):(f=h.create(d,c),j[e]=f,k.push(f),i.push(f)));for(g=0;g<i.length;g++)f=i[g],f.isActive&&-1===n.indexOf(f.id)&&(h.setActive(f,!1,c),l.push(f))},i.removeOld=function(b,c){var d,e,f,g,h=b.list,i=b.table,j=[];for(g=0;g<h.length;g++)d=h[g],e=d.collision,e.bodyA.isSleeping||e.bodyB.isSleeping?d.timeUpdated=c:c-d.timeUpdated>a&&j.push(g);for(g=0;g<j.length;g++)f=j[g]-g,d=h[f],delete i[d.id],h.splice(f,1)},i.clear=function(a){return a.table={},a.list.length=0,a.collisionStart.length=0,a.collisionActive.length=0,a.collisionEnd.length=0,a}}();var j={};!function(){j.ray=function(a,b,c,d){d=d||Number.MIN_VALUE;for(var e=y.angle(b,c),f=y.magnitude(y.sub(b,c)),g=.5*(c.x+b.x),h=.5*(c.y+b.y),i=u.rectangle(g,h,f,d,{angle:e}),j=[],k=0;k<a.length;k++){var m=a[k];if(x.overlaps(m.bounds,i.bounds)){var n=l.collides(m,i);n.collided&&(n.body=n.bodyA=n.bodyB=m,j.push(n))}}return j},j.region=function(a,b,c){for(var d=[],e=0;e<a.length;e++){var f=a[e],g=x.overlaps(f.bounds,b);(g&&!c||!g&&c)&&d.push(f)}return d}}();var k={};!function(){var a=4,b=.2,c=.6;k.solvePosition=function(a,c){var d,e,f,g,h,i,j,k,l;for(d=0;d<a.length;d++)e=a[d],e.isActive&&(f=e.collision,g=f.bodyA,h=f.bodyB,i=f.supports[0],j=f.supportCorrected,k=f.normal,l=y.sub(y.add(h.positionImpulse,i),y.add(g.positionImpulse,j)),e.separation=y.dot(k,l));for(d=0;d<a.length;d++)e=a[d],e.isActive&&(f=e.collision,g=f.bodyA,h=f.bodyB,k=f.normal,positionImpulse=(e.separation*b-e.slop)*c,(g.isStatic||h.isStatic)&&(positionImpulse*=2),g.isStatic||g.isSleeping||(g.positionImpulse.x+=k.x*positionImpulse,g.positionImpulse.y+=k.y*positionImpulse),h.isStatic||h.isSleeping||(h.positionImpulse.x-=k.x*positionImpulse,h.positionImpulse.y-=k.y*positionImpulse))},k.postSolvePosition=function(a){for(var b=0;b<a.length;b++){var d=a[b];(0!==d.positionImpulse.x||0!==d.positionImpulse.y)&&(d.position.x+=d.positionImpulse.x,d.position.y+=d.positionImpulse.y,d.positionPrev.x+=d.positionImpulse.x,d.positionPrev.y+=d.positionImpulse.y,z.translate(d.vertices,d.positionImpulse),x.update(d.bounds,d.vertices,d.velocity),d.positionImpulse.x*=c,d.positionImpulse.y*=c)}},k.preSolveVelocity=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p={};for(b=0;b<a.length;b++)if(d=a[b],d.isActive)for(e=d.activeContacts,f=d.collision,g=f.bodyA,h=f.bodyB,i=f.normal,j=f.tangent,c=0;c<e.length;c++)k=e[c],l=k.vertex,m=k.normalImpulse,n=k.tangentImpulse,p.x=i.x*m+j.x*n,p.y=i.y*m+j.y*n,g.isStatic||g.isSleeping||(o=y.sub(l,g.position),g.positionPrev.x+=p.x*g.inverseMass,g.positionPrev.y+=p.y*g.inverseMass,g.anglePrev+=y.cross(o,p)*g.inverseInertia),h.isStatic||h.isSleeping||(o=y.sub(l,h.position),h.positionPrev.x-=p.x*h.inverseMass,h.positionPrev.y-=p.y*h.inverseMass,h.anglePrev-=y.cross(o,p)*h.inverseInertia)},k.solveVelocity=function(b,c){for(var d={},e=c*c,f=0;f<b.length;f++){var g=b[f];if(g.isActive){var h=g.collision,i=h.bodyA,j=h.bodyB,k=h.normal,l=h.tangent,m=g.activeContacts,n=1/m.length;i.velocity.x=i.position.x-i.positionPrev.x,i.velocity.y=i.position.y-i.positionPrev.y,j.velocity.x=j.position.x-j.positionPrev.x,j.velocity.y=j.position.y-j.positionPrev.y,i.angularVelocity=i.angle-i.anglePrev,j.angularVelocity=j.angle-j.anglePrev;for(var p=0;p<m.length;p++){var q=m[p],r=q.vertex,s=y.sub(r,i.position),t=y.sub(r,j.position),u=y.add(i.velocity,y.mult(y.perp(s),i.angularVelocity)),v=y.add(j.velocity,y.mult(y.perp(t),j.angularVelocity)),w=y.sub(u,v),x=y.dot(k,w),z=y.dot(l,w),A=Math.abs(z),B=o.sign(z),C=(1+g.restitution)*x,D=o.clamp(g.separation+x,0,1),E=z;A>D*g.friction*e&&(E=D*g.friction*e*B);var F=y.cross(s,k),G=y.cross(t,k),H=n/(g.inverseMass+i.inverseInertia*F*F+j.inverseInertia*G*G);if(C*=H,E*=H,0>x&&x*x>a*e)q.normalImpulse=0,q.tangentImpulse=0;else{var I=q.normalImpulse;q.normalImpulse=Math.min(q.normalImpulse+C,0),C=q.normalImpulse-I;var J=q.tangentImpulse;q.tangentImpulse=o.clamp(q.tangentImpulse+E,-A,A),E=q.tangentImpulse-J}d.x=k.x*C+l.x*E,d.y=k.y*C+l.y*E,i.isStatic||i.isSleeping||(i.positionPrev.x+=d.x*i.inverseMass,i.positionPrev.y+=d.y*i.inverseMass,i.anglePrev+=y.cross(s,d)*i.inverseInertia),j.isStatic||j.isSleeping||(j.positionPrev.x-=d.x*j.inverseMass,j.positionPrev.y-=d.y*j.inverseMass,j.anglePrev-=y.cross(t,d)*j.inverseInertia)}}}}}();var l={};!function(){l.collides=function(b,d,e){var f,g,h,i,j=e,k=!1;if(j){var l=b.speed*b.speed+b.angularSpeed*b.angularSpeed+d.speed*d.speed+d.angularSpeed*d.angularSpeed;k=j&&j.collided&&.2>l,i=j}else i={collided:!1,bodyA:b,bodyB:d};if(j&&k){var m=[j.bodyA.axes[j.axisNumber]];if(h=a(j.bodyA.vertices,j.bodyB.vertices,m),i.reused=!0,h.overlap<=0)return i.collided=!1,i}else{if(f=a(b.vertices,d.vertices,b.axes),f.overlap<=0)return i.collided=!1,i;if(g=a(d.vertices,b.vertices,d.axes),g.overlap<=0)return i.collided=!1,i;f.overlap<g.overlap?(h=f,i.bodyA=b,i.bodyB=d):(h=g,i.bodyA=d,i.bodyB=b),i.axisNumber=h.axisNumber}i.collided=!0,i.normal=h.axis,i.depth=h.overlap,b=i.bodyA,d=i.bodyB,y.dot(i.normal,y.sub(d.position,b.position))>0&&(i.normal=y.neg(i.normal)),i.tangent=y.perp(i.normal),i.penetration={x:i.normal.x*i.depth,y:i.normal.y*i.depth};var n=c(b,d,i.normal),o=[n[0]];if(z.contains(b.vertices,n[1]))o.push(n[1]);else{var p=c(d,b,y.neg(i.normal));z.contains(d.vertices,p[0])&&o.push(p[0]),o.length<2&&z.contains(d.vertices,p[1])&&o.push(p[1])}return i.supports=o,i.supportCorrected=y.sub(n[0],i.penetration),i};var a=function(a,c,d){for(var e,f,g={},h={},i={overlap:Number.MAX_VALUE},j=0;j<d.length;j++){if(f=d[j],b(g,a,f),b(h,c,f),e=g.min<h.min?g.max-h.min:h.max-g.min,0>=e)return i.overlap=e,i;e<i.overlap&&(i.overlap=e,i.axis=f,i.axisNumber=j)}return i},b=function(a,b,c){for(var d=y.dot(b[0],c),e=d,f=1;f<b.length;f+=1){var g=y.dot(b[f],c);g>e?e=g:d>g&&(d=g)}a.min=d,a.max=e},c=function(a,b,c){for(var d,e,f=Number.MAX_VALUE,g={x:0,y:0},h=b.vertices,i=a.position,j=h[0],k=h[1],l=0;l<h.length;l++)e=h[l],g.x=e.x-i.x,g.y=e.y-i.y,d=-y.dot(c,g),f>d&&(f=d,j=e);var m=j.index-1>=0?j.index-1:h.length-1;e=h[m],g.x=e.x-i.x,g.y=e.y-i.y,f=-y.dot(c,g),k=e;var n=(j.index+1)%h.length;return e=h[n],g.x=e.x-i.x,g.y=e.y-i.y,d=-y.dot(c,g),f>d&&(f=d,k=e),[j,k]}}();var m={};!function(){var a=1e-6,b=.001;m.create=function(b){var c=b;c.bodyA&&!c.pointA&&(c.pointA={x:0,y:0}),c.bodyB&&!c.pointB&&(c.pointB={x:0,y:0});var d=c.bodyA?y.add(c.bodyA.position,c.pointA):c.pointA,e=c.bodyB?y.add(c.bodyB.position,c.pointB):c.pointB,f=y.magnitude(y.sub(d,e));c.length=c.length||f||a;var g={visible:!0,lineWidth:2,strokeStyle:"#666"};return c.render=o.extend(g,c.render),c.id=c.id||o.nextId(),c.label=c.label||"Constraint",c.type="constraint",c.stiffness=c.stiffness||1,c.angularStiffness=c.angularStiffness||0,c.angleA=c.bodyA?c.bodyA.angle:c.angleA,c.angleB=c.bodyB?c.bodyB.angle:c.angleB,c},m.solveAll=function(a,b){for(var c=0;c<a.length;c++)m.solve(a[c],b)},m.solve=function(c,d){var e=c.bodyA,f=c.bodyB,g=c.pointA,h=c.pointB;e&&!e.isStatic&&(c.pointA=y.rotate(g,e.angle-c.angleA),c.angleA=e.angle),f&&!f.isStatic&&(c.pointB=y.rotate(h,f.angle-c.angleB),c.angleB=f.angle);var i=g,j=h;if(e&&(i=y.add(e.position,g)),f&&(j=y.add(f.position,h)),i&&j){var k=y.sub(i,j),l=y.magnitude(k);0===l&&(l=a);var m=(l-c.length)/l,n=y.div(k,l),p=y.mult(k,.5*m*c.stiffness*d*d);if(!(Math.abs(1-l/c.length)<b*d)){var q,r,s,u,v,w,x,z;e&&!e.isStatic?(s={x:i.x-e.position.x+p.x,y:i.y-e.position.y+p.y},e.velocity.x=e.position.x-e.positionPrev.x,e.velocity.y=e.position.y-e.positionPrev.y,e.angularVelocity=e.angle-e.anglePrev,q=y.add(e.velocity,y.mult(y.perp(s),e.angularVelocity)),v=y.dot(s,n),x=e.inverseMass+e.inverseInertia*v*v):(q={x:0,y:0},x=e?e.inverseMass:0),f&&!f.isStatic?(u={x:j.x-f.position.x-p.x,y:j.y-f.position.y-p.y},f.velocity.x=f.position.x-f.positionPrev.x,f.velocity.y=f.position.y-f.positionPrev.y,f.angularVelocity=f.angle-f.anglePrev,r=y.add(f.velocity,y.mult(y.perp(u),f.angularVelocity)),w=y.dot(u,n),z=f.inverseMass+f.inverseInertia*w*w):(r={x:0,y:0},z=f?f.inverseMass:0);var A=y.sub(r,q),B=y.dot(n,A)/(x+z);B>0&&(B=0);var C,D={x:n.x*B,y:n.y*B};e&&!e.isStatic&&(C=y.cross(s,D)*e.inverseInertia*(1-c.angularStiffness),t.set(e,!1),C=o.clamp(C,-.01,.01),e.constraintImpulse.x-=p.x,e.constraintImpulse.y-=p.y,e.constraintImpulse.angle+=C,e.position.x-=p.x,e.position.y-=p.y,e.angle+=C),f&&!f.isStatic&&(C=y.cross(u,D)*f.inverseInertia*(1-c.angularStiffness),t.set(f,!1),C=o.clamp(C,-.01,.01),f.constraintImpulse.x+=p.x,f.constraintImpulse.y+=p.y,f.constraintImpulse.angle-=C,f.position.x+=p.x,f.position.y+=p.y,f.angle-=C)}}},m.postSolveAll=function(a){for(var b=0;b<a.length;b++){var c=a[b],d=c.constraintImpulse;z.translate(c.vertices,d),0!==d.angle&&(z.rotate(c.vertices,d.angle,c.position),w.rotate(c.axes,d.angle),d.angle=0),x.update(c.bounds,c.vertices),d.x=0,d.y=0}}}();var n={};!function(){n.create=function(a,b){var d=a.input.mouse,e=m.create({label:"Mouse Constraint",pointA:d.position,pointB:{x:0,y:0},length:.01,stiffness:.1,angularStiffness:1,render:{strokeStyle:"#90EE90",lineWidth:3}}),f={type:"mouseConstraint",mouse:d,dragBody:null,dragPoint:null,constraint:e},g=o.extend(f,b);return q.on(a,"tick",function(){var b=c.allBodies(a.world);n.update(g,b)}),g},n.update=function(a,b){var c=a.mouse,d=a.constraint;if(0===c.button){if(!d.bodyB)for(var e=0;e<b.length;e++){var f=b[e];x.contains(f.bounds,c.position)&&z.contains(f.vertices,c.position)&&(d.pointA=c.position,d.bodyB=f,d.pointB={x:c.position.x-f.position.x,y:c.position.y-f.position.y},d.angleB=f.angle,t.set(f,!1))}}else d.bodyB=null,d.pointB=null;d.bodyB&&(t.set(d.bodyB,!1),d.pointA=c.position)}}();var o={};!function(){o._nextId=0,o.extend=function(a,b){var c,d,e;"boolean"==typeof b?(c=2,e=b):(c=1,e=!0),d=Array.prototype.slice.call(arguments,c);for(var f=0;f<d.length;f++){var g=d[f];if(g)for(var h in g)e&&g[h]&&g[h].constructor===Object?a[h]&&a[h].constructor!==Object?a[h]=g[h]:(a[h]=a[h]||{},o.extend(a[h],e,g[h])):a[h]=g[h]}return a},o.clone=function(a,b){return o.extend({},b,a)},o.keys=function(a){if(Object.keys)return Object.keys(a);var b=[];for(var c in a)b.push(c);return b},o.values=function(a){var b=[];if(Object.keys){for(var c=Object.keys(a),d=0;d<c.length;d++)b.push(a[c[d]]);return b}for(var e in a)b.push(a[e]);return b},o.shadeColor=function(a,b){var c=parseInt(a.slice(1),16),d=Math.round(2.55*b),e=(c>>16)+d,f=(c>>8&255)+d,g=(255&c)+d;return"#"+(16777216+65536*(255>e?1>e?0:e:255)+256*(255>f?1>f?0:f:255)+(255>g?1>g?0:g:255)).toString(16).slice(1)},o.shuffle=function(a){for(var b=a.length-1;b>0;b--){var c=Math.floor(Math.random()*(b+1)),d=a[b];a[b]=a[c],a[c]=d}return a},o.choose=function(a){return a[Math.floor(Math.random()*a.length)]},o.isElement=function(a){try{return a instanceof HTMLElement}catch(b){return"object"==typeof a&&1===a.nodeType&&"object"==typeof a.style&&"object"==typeof a.ownerDocument}},o.clamp=function(a,b,c){return b>a?b:a>c?c:a},o.sign=function(a){return 0>a?-1:1},o.now=function(){var a=window.performance;return a?(a.now=a.now||a.webkitNow||a.msNow||a.oNow||a.mozNow,+a.now()):+new Date},o.random=function(a,b){return a+Math.random()*(b-a)},o.colorToNumber=function(a){return a=a.replace("#",""),3==a.length&&(a=a.charAt(0)+a.charAt(0)+a.charAt(1)+a.charAt(1)+a.charAt(2)+a.charAt(2)),parseInt(a,16)},o.log=function(a,b){if(console&&console.log){var c;switch(b){case"warn":c="color: coral";break;case"error":c="color: red"}console.log("%c [Matter] "+b+": "+a,c)}},o.nextId=function(){return o._nextId++}}();var p={};!function(){var a=60,e=a,h=1e3/a,j=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.msRequestAnimationFrame||function(a){window.setTimeout(function(){a(o.now())},h)};p.create=function(b,c){c=o.isElement(b)?c:b,b=o.isElement(b)?b:null;var e={enabled:!0,positionIterations:6,velocityIterations:4,constraintIterations:2,enableSleeping:!1,timeScale:1,input:{},events:[],timing:{fps:a,timestamp:0,delta:h,correction:1,deltaMin:1e3/a,deltaMax:1e3/(.5*a),timeScale:1,isFixed:!1},render:{element:b,controller:A}},j=o.extend(e,c);return j.render=j.render.controller.create(j.render),j.world=d.create(j.world),j.pairs=i.create(),j.metrics=j.metrics||r.create(),j.input.mouse=j.input.mouse||s.create(j.render.canvas),j.broadphase=j.broadphase||{current:"grid",grid:{controller:g,instance:g.create(),detector:f.collisions},bruteForce:{detector:f.bruteForce}},j},p.run=function(a){var b,c=0,d=0,f=[],g=1;!function h(i){if(j(h),a.enabled){var k,m,o=a.timing,r={timestamp:i};q.trigger(a,"beforeTick",r),o.isFixed?k=o.delta:(k=i-b||o.delta,b=i,f.push(k),f=f.slice(-e),k=Math.min.apply(null,f),k=k<o.deltaMin?o.deltaMin:k,k=k>o.deltaMax?o.deltaMax:k,m=k/o.delta,o.delta=k),0!==g&&(m*=o.timeScale/g),0===o.timeScale&&(m=0),g=o.timeScale,d+=1,i-c>=1e3&&(o.fps=d*((i-c)/1e3),c=i,d=0),q.trigger(a,"tick",r),a.world.isModified&&a.render.controller.clear(a.render),p.update(a,k,m),n(a),l(a),p.render(a),q.trigger(a,"afterTick",r)}}()},p.update=function(a,d,e){e="undefined"!=typeof e?e:1;var f,g=a.world,h=a.timing,j=a.broadphase[a.broadphase.current],l=[];h.timestamp+=d*h.timeScale,h.correction=e;var n={timestamp:a.timing.timestamp};q.trigger(a,"beforeUpdate",n);var o=c.allBodies(g),p=c.allConstraints(g);for(r.reset(a.metrics),a.enableSleeping&&t.update(o),b.applyGravityAll(o,g.gravity),b.updateAll(o,d,h.timeScale,e,g.bounds),f=0;f<a.constraintIterations;f++)m.solveAll(p,h.timeScale);m.postSolveAll(o),j.controller?(g.isModified&&j.controller.clear(j.instance),j.controller.update(j.instance,o,a,g.isModified),l=j.instance.pairsList):l=o;var s=j.detector(l,a),u=a.pairs,v=h.timestamp;for(i.update(u,s,v),i.removeOld(u,v),a.enableSleeping&&t.afterCollisions(u.list),k.preSolveVelocity(u.list),f=0;f<a.velocityIterations;f++)k.solveVelocity(u.list,h.timeScale);for(f=0;f<a.positionIterations;f++)k.solvePosition(u.list,h.timeScale);return k.postSolvePosition(o),r.update(a.metrics,a),b.resetForcesAll(o),g.isModified&&c.setModified(g,!1,!1,!0),q.trigger(a,"afterUpdate",n),a},p.render=function(a){var b={timestamp:a.timing.timestamp};q.trigger(a,"beforeRender",b),a.render.controller.world(a),q.trigger(a,"afterRender",b)},p.merge=function(a,b){if(o.extend(a,b),b.world){a.world=b.world,p.clear(a);for(var d=c.allBodies(a.world),e=0;e<d.length;e++){var f=d[e];t.set(f,!1),f.id=o.nextId()}}},p.clear=function(a){var b=a.world;i.clear(a.pairs);var d=a.broadphase[a.broadphase.current];if(d.controller){var e=c.allBodies(b);d.controller.clear(d.instance),d.controller.update(d.instance,e,a,!0)}};var l=function(a){var b=a.input.mouse,c=b.sourceEvents;c.mousemove&&q.trigger(a,"mousemove",{mouse:b}),c.mousedown&&q.trigger(a,"mousedown",{mouse:b}),c.mouseup&&q.trigger(a,"mouseup",{mouse:b}),s.clearSourceEvents(b)},n=function(a){var b=a.pairs;b.collisionStart.length>0&&q.trigger(a,"collisionStart",{pairs:b.collisionStart}),b.collisionActive.length>0&&q.trigger(a,"collisionActive",{pairs:b.collisionActive}),b.collisionEnd.length>0&&q.trigger(a,"collisionEnd",{pairs:b.collisionEnd})}}();var q={};!function(){q.on=function(a,b,c){for(var d,e=b.split(" "),f=0;f<e.length;f++)d=e[f],a.events=a.events||{},a.events[d]=a.events[d]||[],a.events[d].push(c);return c},q.off=function(a,b,c){if(!b)return void(a.events={});"function"==typeof b&&(c=b,b=o.keys(a.events).join(" "));for(var d=b.split(" "),e=0;e<d.length;e++){var f=a.events[d[e]],g=[];if(c)for(var h=0;h<f.length;h++)f[h]!==c&&g.push(f[h]);a.events[d[e]]=g}},q.trigger=function(a,b,c){var d,e,f,g;if(a.events){c||(c={}),d=b.split(" ");for(var h=0;h<d.length;h++)if(e=d[h],f=a.events[e]){g=o.clone(c,!1),g.name=e,g.source=a;for(var i=0;i<f.length;i++)f[i].apply(a,[g])}}}}();var r={};!function(){r.create=function(){return{extended:!1,narrowDetections:0,narrowphaseTests:0,narrowReuse:0,narrowReuseCount:0,midphaseTests:0,broadphaseTests:0,narrowEff:1e-4,midEff:1e-4,broadEff:1e-4,collisions:0,buckets:0,bodies:0,pairs:0}},r.reset=function(a){a.extended&&(a.narrowDetections=0,a.narrowphaseTests=0,a.narrowReuse=0,a.narrowReuseCount=0,a.midphaseTests=0,a.broadphaseTests=0,a.narrowEff=0,a.midEff=0,a.broadEff=0,a.collisions=0,a.buckets=0,a.pairs=0,a.bodies=0)},r.update=function(a,b){if(a.extended){var d=b.world,e=(b.broadphase[b.broadphase.current],c.allBodies(d));a.collisions=a.narrowDetections,a.pairs=b.pairs.list.length,a.bodies=e.length,a.midEff=(a.narrowDetections/(a.midphaseTests||1)).toFixed(2),a.narrowEff=(a.narrowDetections/(a.narrowphaseTests||1)).toFixed(2),a.broadEff=(1-a.broadphaseTests/(e.length||1)).toFixed(2),a.narrowReuse=(a.narrowReuseCount/(a.narrowphaseTests||1)).toFixed(2)}}}();var s;!function(){s=function(b){var c=this;this.element=b||document.body,this.absolute={x:0,y:0},this.position={x:0,y:0},this.mousedownPosition={x:0,y:0},this.mouseupPosition={x:0,y:0},this.offset={x:0,y:0},this.scale={x:1,y:1},this.wheelDelta=0,this.button=-1,this.sourceEvents={mousemove:null,mousedown:null,mouseup:null,mousewheel:null},this.mousemove=function(b){var d=a(b,c.element),e=b.changedTouches;e&&(c.button=0,b.preventDefault()),c.absolute.x=d.x,c.absolute.y=d.y,c.position.x=c.absolute.x*c.scale.x+c.offset.x,c.position.y=c.absolute.y*c.scale.y+c.offset.y,c.sourceEvents.mousemove=b},this.mousedown=function(b){var d=a(b,c.element),e=b.changedTouches;e?(c.button=0,b.preventDefault()):c.button=b.button,c.absolute.x=d.x,c.absolute.y=d.y,c.position.x=c.absolute.x*c.scale.x+c.offset.x,c.position.y=c.absolute.y*c.scale.y+c.offset.y,c.mousedownPosition.x=c.position.x,c.mousedownPosition.y=c.position.y,c.sourceEvents.mousedown=b},this.mouseup=function(b){var d=a(b,c.element),e=b.changedTouches;e&&b.preventDefault(),c.button=-1,c.absolute.x=d.x,c.absolute.y=d.y,c.position.x=c.absolute.x*c.scale.x+c.offset.x,c.position.y=c.absolute.y*c.scale.y+c.offset.y,c.mouseupPosition.x=c.position.x,c.mouseupPosition.y=c.position.y,c.sourceEvents.mouseup=b},this.mousewheel=function(a){c.wheelDelta=Math.max(-1,Math.min(1,a.wheelDelta||-a.detail)),a.preventDefault()},s.setElement(c,c.element)},s.create=function(a){return new s(a)},s.setElement=function(a,b){a.element=b,b.addEventListener("mousemove",a.mousemove),b.addEventListener("mousedown",a.mousedown),b.addEventListener("mouseup",a.mouseup),b.addEventListener("mousewheel",a.mousewheel),b.addEventListener("DOMMouseScroll",a.mousewheel),b.addEventListener("touchmove",a.mousemove),b.addEventListener("touchstart",a.mousedown),b.addEventListener("touchend",a.mouseup)},s.clearSourceEvents=function(a){a.sourceEvents.mousemove=null,a.sourceEvents.mousedown=null,a.sourceEvents.mouseup=null,a.sourceEvents.mousewheel=null,a.wheelDelta=0},s.setOffset=function(a,b){a.offset.x=b.x,a.offset.y=b.y,a.position.x=a.absolute.x*a.scale.x+a.offset.x,a.position.y=a.absolute.y*a.scale.y+a.offset.y},s.setScale=function(a,b){a.scale.x=b.x,a.scale.y=b.y,a.position.x=a.absolute.x*a.scale.x+a.offset.x,a.position.y=a.absolute.y*a.scale.y+a.offset.y};var a=function(a,b){var c,d,e=b.getBoundingClientRect(),f=document.documentElement||document.body.parentNode||document.body,g=void 0!==window.pageXOffset?window.pageXOffset:f.scrollLeft,h=void 0!==window.pageYOffset?window.pageYOffset:f.scrollTop,i=a.changedTouches;return i?(c=i[0].pageX-e.left-g,d=i[0].pageY-e.top-h):(c=a.pageX-e.left-g,d=a.pageY-e.top-h),{x:c/(b.clientWidth/b.width),y:d/(b.clientHeight/b.height)}}}();var t={};!function(){var a=.18,b=.08,c=.9;t.update=function(a){for(var d=0;d<a.length;d++){var e=a[d],f=e.speed*e.speed+e.angularSpeed*e.angularSpeed;if(e.force.x>0||e.force.y>0)t.set(e,!1);else{var g=Math.min(e.motion,f),h=Math.max(e.motion,f);e.motion=c*g+(1-c)*h,e.sleepThreshold>0&&e.motion<b?(e.sleepCounter+=1,e.sleepCounter>=e.sleepThreshold&&t.set(e,!0)):e.sleepCounter>0&&(e.sleepCounter-=1)}}},t.afterCollisions=function(b){for(var c=0;c<b.length;c++){var d=b[c];if(d.isActive){var e=d.collision,f=e.bodyA,g=e.bodyB;if(!(f.isSleeping&&g.isSleeping||f.isStatic||g.isStatic)&&(f.isSleeping||g.isSleeping)){var h=f.isSleeping&&!f.isStatic?f:g,i=h===f?g:f;!h.isStatic&&i.motion>a&&t.set(h,!1)}}}},t.set=function(a,b){b?(a.isSleeping=!0,a.sleepCounter=a.sleepThreshold,a.positionImpulse.x=0,a.positionImpulse.y=0,a.positionPrev.x=a.position.x,a.positionPrev.y=a.position.y,a.anglePrev=a.angle,a.speed=0,a.angularSpeed=0,a.motion=0):(a.isSleeping=!1,a.sleepCounter=0)}}();var u={};!function(){u.rectangle=function(a,c,d,e,f){f=f||{};var g={label:"Rectangle Body",position:{x:a,y:c},vertices:z.fromPath("L 0 0 L "+d+" 0 L "+d+" "+e+" L 0 "+e)};if(f.chamfer){var h=f.chamfer;g.vertices=z.chamfer(g.vertices,h.radius,h.quality,h.qualityMin,h.qualityMax),delete f.chamfer}return b.create(o.extend({},g,f))},u.trapezoid=function(a,c,d,e,f,g){g=g||{},f*=.5;var h=(1-2*f)*d,i=d*f,j=i+h,k=j+i,l={label:"Trapezoid Body",position:{x:a,y:c},vertices:z.fromPath("L 0 0 L "+i+" "+-e+" L "+j+" "+-e+" L "+k+" 0")};
if(g.chamfer){var m=g.chamfer;l.vertices=z.chamfer(l.vertices,m.radius,m.quality,m.qualityMin,m.qualityMax),delete g.chamfer}return b.create(o.extend({},l,g))},u.circle=function(a,b,c,d,e){d=d||{},d.label="Circle Body",e=e||25;var f=Math.ceil(Math.max(10,Math.min(e,c)));return f%2===1&&(f+=1),d.circleRadius=c,u.polygon(a,b,f,c,d)},u.polygon=function(a,c,d,e,f){if(f=f||{},3>d)return u.circle(a,c,e,f);for(var g=2*Math.PI/d,h="",i=.5*g,j=0;d>j;j+=1){var k=i+j*g,l=Math.cos(k)*e,m=Math.sin(k)*e;h+="L "+l.toFixed(3)+" "+m.toFixed(3)+" "}var n={label:"Polygon Body",position:{x:a,y:c},vertices:z.fromPath(h)};if(f.chamfer){var p=f.chamfer;n.vertices=z.chamfer(n.vertices,p.radius,p.quality,p.qualityMin,p.qualityMax),delete f.chamfer}return b.create(o.extend({},n,f))}}();var v={};!function(){v.stack=function(a,d,e,f,g,h,i){for(var j,k=c.create({label:"Stack"}),l=a,m=d,n=0,o=0;f>o;o++){for(var p=0,q=0;e>q;q++){var r=i(l,m,q,o,j,n);if(r){var s=r.bounds.max.y-r.bounds.min.y,t=r.bounds.max.x-r.bounds.min.x;s>p&&(p=s),b.translate(r,{x:.5*t,y:.5*s}),l=r.bounds.max.x+g,c.addBody(k,r),j=r,n+=1}}m+=p+h,l=a}return k},v.chain=function(a,b,d,e,f,g){for(var h=a.bodies,i=1;i<h.length;i++){var j=h[i-1],k=h[i],l=j.bounds.max.y-j.bounds.min.y,n=j.bounds.max.x-j.bounds.min.x,p=k.bounds.max.y-k.bounds.min.y,q=k.bounds.max.x-k.bounds.min.x,r={bodyA:j,pointA:{x:n*b,y:l*d},bodyB:k,pointB:{x:q*e,y:p*f}},s=o.extend(r,g);c.addConstraint(a,m.create(s))}return a.label+=" Chain",a},v.mesh=function(a,b,d,e,f){var g,h,i,j,k,l=a.bodies;for(g=0;d>g;g++){for(h=0;b>h;h++)h>0&&(i=l[h-1+g*b],j=l[h+g*b],c.addConstraint(a,m.create(o.extend({bodyA:i,bodyB:j},f))));for(h=0;b>h;h++)g>0&&(i=l[h+(g-1)*b],j=l[h+g*b],c.addConstraint(a,m.create(o.extend({bodyA:i,bodyB:j},f))),e&&h>0&&(k=l[h-1+(g-1)*b],c.addConstraint(a,m.create(o.extend({bodyA:k,bodyB:j},f)))),e&&b-1>h&&(k=l[h+1+(g-1)*b],c.addConstraint(a,m.create(o.extend({bodyA:k,bodyB:j},f)))))}return a.label+=" Mesh",a},v.pyramid=function(a,c,d,e,f,g,h){return v.stack(a,c,d,e,f,g,function(c,g,i,j,k,l){var m=Math.min(e,Math.ceil(d/2)),n=k?k.bounds.max.x-k.bounds.min.x:0;if(!(j>m)){j=m-j;var o=j,p=d-1-j;if(!(o>i||i>p)){1===l&&b.translate(k,{x:(i+(d%2===1?1:-1))*n,y:0});var q=k?i*n:0;return h(a+q+i*f,g,i,j,k,l)}}})},v.newtonsCradle=function(a,b,d,e,f){for(var g=c.create({label:"Newtons Cradle"}),h=0;d>h;h++){var i=1.9,j=u.circle(a+h*e*i,b+f,e,{inertia:99999,restitution:1,friction:0,frictionAir:1e-4,slop:.01}),k=m.create({pointA:{x:a+h*e*i,y:b},bodyB:j});c.addBody(g,j),c.addConstraint(g,k)}return g},v.car=function(a,d,e,f,g){var h=b.nextGroupId(),i=-20,j=.5*-e+i,k=.5*e-i,l=0,n=c.create({label:"Car"}),o=u.trapezoid(a,d,e,f,.3,{groupId:h,friction:.01,chamfer:{radius:10}}),p=u.circle(a+j,d+l,g,{groupId:h,restitution:.5,friction:.9,density:.01}),q=u.circle(a+k,d+l,g,{groupId:h,restitution:.5,friction:.9,density:.01}),r=m.create({bodyA:o,pointA:{x:j,y:l},bodyB:p,stiffness:.5}),s=m.create({bodyA:o,pointA:{x:k,y:l},bodyB:q,stiffness:.5});return c.addBody(n,o),c.addBody(n,p),c.addBody(n,q),c.addConstraint(n,r),c.addConstraint(n,s),n},v.softBody=function(a,b,c,d,e,f,g,h,i,j){i=o.extend({inertia:1/0},i),j=o.extend({stiffness:.4},j);var k=v.stack(a,b,c,d,e,f,function(a,b){return u.circle(a,b,h,i)});return v.mesh(k,c,d,g,j),k.label="Soft Body",k}}();var w={};!function(){w.fromVertices=function(a){for(var b={},c=0;c<a.length;c++){var d=(c+1)%a.length,e=y.normalise({x:a[d].y-a[c].y,y:a[c].x-a[d].x}),f=0===e.y?1/0:e.x/e.y;f=f.toFixed(3).toString(),b[f]=e}return o.values(b)},w.rotate=function(a,b){if(0!==b)for(var c=Math.cos(b),d=Math.sin(b),e=0;e<a.length;e++){var f,g=a[e];f=g.x*c-g.y*d,g.y=g.x*d+g.y*c,g.x=f}}}();var x={};!function(){x.create=function(a){var b={min:{x:0,y:0},max:{x:0,y:0}};return a&&x.update(b,a),b},x.update=function(a,b,c){a.min.x=Number.MAX_VALUE,a.max.x=Number.MIN_VALUE,a.min.y=Number.MAX_VALUE,a.max.y=Number.MIN_VALUE;for(var d=0;d<b.length;d++){var e=b[d];e.x>a.max.x&&(a.max.x=e.x),e.x<a.min.x&&(a.min.x=e.x),e.y>a.max.y&&(a.max.y=e.y),e.y<a.min.y&&(a.min.y=e.y)}c&&(c.x>0?a.max.x+=c.x:a.min.x+=c.x,c.y>0?a.max.y+=c.y:a.min.y+=c.y)},x.contains=function(a,b){return b.x>=a.min.x&&b.x<=a.max.x&&b.y>=a.min.y&&b.y<=a.max.y},x.overlaps=function(a,b){return a.min.x<=b.max.x&&a.max.x>=b.min.x&&a.max.y>=b.min.y&&a.min.y<=b.max.y},x.translate=function(a,b){a.min.x+=b.x,a.max.x+=b.x,a.min.y+=b.y,a.max.y+=b.y},x.shift=function(a,b){var c=a.max.x-a.min.x,d=a.max.y-a.min.y;a.min.x=b.x,a.max.x=b.x+c,a.min.y=b.y,a.max.y=b.y+d}}();var y={};!function(){y.magnitude=function(a){return Math.sqrt(a.x*a.x+a.y*a.y)},y.magnitudeSquared=function(a){return a.x*a.x+a.y*a.y},y.rotate=function(a,b){var c=Math.cos(b),d=Math.sin(b);return{x:a.x*c-a.y*d,y:a.x*d+a.y*c}},y.rotateAbout=function(a,b,c){var d=Math.cos(b),e=Math.sin(b);return{x:c.x+((a.x-c.x)*d-(a.y-c.y)*e),y:c.y+((a.x-c.x)*e+(a.y-c.y)*d)}},y.normalise=function(a){var b=y.magnitude(a);return 0===b?{x:0,y:0}:{x:a.x/b,y:a.y/b}},y.dot=function(a,b){return a.x*b.x+a.y*b.y},y.cross=function(a,b){return a.x*b.y-a.y*b.x},y.add=function(a,b){return{x:a.x+b.x,y:a.y+b.y}},y.sub=function(a,b){return{x:a.x-b.x,y:a.y-b.y}},y.mult=function(a,b){return{x:a.x*b,y:a.y*b}},y.div=function(a,b){return{x:a.x/b,y:a.y/b}},y.perp=function(a,b){return b=b===!0?-1:1,{x:b*-a.y,y:b*a.x}},y.neg=function(a){return{x:-a.x,y:-a.y}},y.angle=function(a,b){return Math.atan2(b.y-a.y,b.x-a.x)}}();var z={};!function(){z.create=function(a,b){for(var c=0;c<a.length;c++)a[c].index=c,a[c].body=b},z.fromPath=function(a){var b=/L\s*([\-\d\.]*)\s*([\-\d\.]*)/gi,c=[];return a.replace(b,function(a,b,d){c.push({x:parseFloat(b,10),y:parseFloat(d,10)})}),c},z.centre=function(a){for(var b,c,d,e=z.area(a,!0),f={x:0,y:0},g=0;g<a.length;g++)d=(g+1)%a.length,b=y.cross(a[g],a[d]),c=y.mult(y.add(a[g],a[d]),b),f=y.add(f,c);return y.div(f,6*e)},z.area=function(a,b){for(var c=0,d=a.length-1,e=0;e<a.length;e++)c+=(a[d].x-a[e].x)*(a[d].y+a[e].y),d=e;return b?c/2:Math.abs(c)/2},z.inertia=function(a,b){for(var c,d,e=0,f=0,g=a,h=0;h<g.length;h++)d=(h+1)%g.length,c=Math.abs(y.cross(g[d],g[h])),e+=c*(y.dot(g[d],g[d])+y.dot(g[d],g[h])+y.dot(g[h],g[h])),f+=c;return b/6*(e/f)},z.translate=function(a,b,c){var d;if(c)for(d=0;d<a.length;d++)a[d].x+=b.x*c,a[d].y+=b.y*c;else for(d=0;d<a.length;d++)a[d].x+=b.x,a[d].y+=b.y},z.rotate=function(a,b,c){if(0!==b)for(var d=Math.cos(b),e=Math.sin(b),f=0;f<a.length;f++){var g=a[f],h=g.x-c.x,i=g.y-c.y;g.x=c.x+(h*d-i*e),g.y=c.y+(h*e+i*d)}},z.contains=function(a,b){for(var c=0;c<a.length;c++){var d=a[c],e=a[(c+1)%a.length];if((b.x-d.x)*(e.y-d.y)+(b.y-d.y)*(d.x-e.x)>0)return!1}return!0},z.scale=function(a,b,c,d){if(1===b&&1===c)return a;d=d||z.centre(a);for(var e,f,g=0;g<a.length;g++)e=a[g],f=y.sub(e,d),a[g].x=d.x+f.x*b,a[g].y=d.y+f.y*c;return a},z.chamfer=function(a,b,c,d,e){b=b||[8],b.length||(b=[b]),c="undefined"!=typeof c?c:-1,d=d||2,e=e||14;for(var f=(z.centre(a),[]),g=0;g<a.length;g++){var h=a[g-1>=0?g-1:a.length-1],i=a[g],j=a[(g+1)%a.length],k=b[g<b.length?g:b.length-1];if(0!==k){var l=y.normalise({x:i.y-h.y,y:h.x-i.x}),m=y.normalise({x:j.y-i.y,y:i.x-j.x}),n=Math.sqrt(2*Math.pow(k,2)),p=y.mult(o.clone(l),k),q=y.normalise(y.mult(y.add(l,m),.5)),r=y.sub(i,y.mult(q,n)),s=c;-1===c&&(s=1.75*Math.pow(k,.32)),s=o.clamp(s,d,e),s%2===1&&(s+=1);for(var t=Math.acos(y.dot(l,m)),u=t/s,v=0;s>v;v++)f.push(y.add(y.rotate(p,u*v),r))}else f.push(i)}return f}}();var A={};!function(){A.create=function(b){var c={controller:A,element:null,canvas:null,options:{width:800,height:600,background:"#fafafa",wireframeBackground:"#222",hasBounds:!1,enabled:!0,wireframes:!0,showSleeping:!0,showDebug:!1,showBroadphase:!1,showBounds:!1,showVelocity:!1,showCollisions:!1,showAxes:!1,showPositions:!1,showAngleIndicator:!1,showIds:!1,showShadows:!1}},d=o.extend(c,b);return d.canvas=d.canvas||a(d.options.width,d.options.height),d.context=d.canvas.getContext("2d"),d.textures={},d.bounds=d.bounds||{min:{x:0,y:0},max:{x:d.options.width,y:d.options.height}},A.setBackground(d,d.options.background),o.isElement(d.element)?d.element.appendChild(d.canvas):o.log('No "render.element" passed, "render.canvas" was not inserted into document.',"warn"),d},A.clear=function(){},A.setBackground=function(a,b){if(a.currentBackground!==b){var c=b;/(jpg|gif|png)$/.test(b)&&(c="url("+b+")"),a.canvas.style.background=c,a.canvas.style.backgroundSize="contain",a.currentBackground=b}},A.world=function(a){var b,d=a.render,e=a.world,f=d.canvas,g=d.context,h=d.options,i=c.allBodies(e),j=c.allConstraints(e),k=[],l=[];h.wireframes?A.setBackground(d,h.wireframeBackground):A.setBackground(d,h.background),g.globalCompositeOperation="source-in",g.fillStyle="transparent",g.fillRect(0,0,f.width,f.height),g.globalCompositeOperation="source-over";var m=d.bounds.max.x-d.bounds.min.x,n=d.bounds.max.y-d.bounds.min.y,o=m/d.options.width,p=n/d.options.height;if(h.hasBounds){for(b=0;b<i.length;b++){var q=i[b];x.overlaps(q.bounds,d.bounds)&&k.push(q)}for(b=0;b<j.length;b++){var r=j[b],s=r.bodyA,t=r.bodyB,u=r.pointA,v=r.pointB;s&&(u=y.add(s.position,r.pointA)),t&&(v=y.add(t.position,r.pointB)),u&&v&&(x.contains(d.bounds,u)||x.contains(d.bounds,v))&&l.push(r)}g.scale(1/o,1/p),g.translate(-d.bounds.min.x,-d.bounds.min.y)}else l=j,k=i;!h.wireframes||a.enableSleeping&&h.showSleeping?A.bodies(a,k,g):A.bodyWireframes(a,k,g),h.showBounds&&A.bodyBounds(a,k,g),(h.showAxes||h.showAngleIndicator)&&A.bodyAxes(a,k,g),h.showPositions&&A.bodyPositions(a,k,g),h.showVelocity&&A.bodyVelocity(a,k,g),h.showIds&&A.bodyIds(a,k,g),h.showCollisions&&A.collisions(a,a.pairs.list,g),A.constraints(l,g),h.showBroadphase&&"grid"===a.broadphase.current&&A.grid(a,a.broadphase[a.broadphase.current].instance,g),h.showDebug&&A.debug(a,g),h.hasBounds&&g.setTransform(1,0,0,1,0,0)},A.debug=function(a,b){var d=b,e=a.world,f=a.render,h=f.options,i=c.allBodies(e),j="    ";if(a.timing.timestamp-(f.debugTimestamp||0)>=500){var k="";k+="fps: "+Math.round(a.timing.fps)+j,a.metrics.extended&&(k+="delta: "+a.timing.delta.toFixed(3)+j,k+="correction: "+a.timing.correction.toFixed(3)+j,k+="bodies: "+i.length+j,a.broadphase.controller===g&&(k+="buckets: "+a.metrics.buckets+j),k+="\n",k+="collisions: "+a.metrics.collisions+j,k+="pairs: "+a.pairs.list.length+j,k+="broad: "+a.metrics.broadEff+j,k+="mid: "+a.metrics.midEff+j,k+="narrow: "+a.metrics.narrowEff+j),f.debugString=k,f.debugTimestamp=a.timing.timestamp}if(f.debugString){d.font="12px Arial",d.fillStyle=h.wireframes?"rgba(255,255,255,0.5)":"rgba(0,0,0,0.5)";for(var l=f.debugString.split("\n"),m=0;m<l.length;m++)d.fillText(l[m],50,50+18*m)}},A.constraints=function(a,b){for(var c=b,d=0;d<a.length;d++){var e=a[d];if(e.render.visible&&e.pointA&&e.pointB){var f=e.bodyA,g=e.bodyB;f?(c.beginPath(),c.moveTo(f.position.x+e.pointA.x,f.position.y+e.pointA.y)):(c.beginPath(),c.moveTo(e.pointA.x,e.pointA.y)),g?c.lineTo(g.position.x+e.pointB.x,g.position.y+e.pointB.y):c.lineTo(e.pointB.x,e.pointB.y),c.lineWidth=e.render.lineWidth,c.strokeStyle=e.render.strokeStyle,c.stroke()}}},A.bodyShadows=function(a,b,c){for(var d=c,e=a.render,f=(e.options,0);f<b.length;f++){var g=b[f];if(g.render.visible){if(g.circleRadius)d.beginPath(),d.arc(g.position.x,g.position.y,g.circleRadius,0,2*Math.PI),d.closePath();else{d.beginPath(),d.moveTo(g.vertices[0].x,g.vertices[0].y);for(var h=1;h<g.vertices.length;h++)d.lineTo(g.vertices[h].x,g.vertices[h].y);d.closePath()}var i=g.position.x-.5*e.options.width,j=g.position.y-.2*e.options.height,k=Math.abs(i)+Math.abs(j);d.shadowColor="rgba(0,0,0,0.15)",d.shadowOffsetX=.05*i,d.shadowOffsetY=.05*j,d.shadowBlur=1+12*Math.min(1,k/1e3),d.fill(),d.shadowColor=null,d.shadowOffsetX=null,d.shadowOffsetY=null,d.shadowBlur=null}}},A.bodies=function(a,c,d){var e,f=d,g=a.render,h=g.options;for(e=0;e<c.length;e++){var i=c[e];if(i.render.visible)if(i.render.sprite&&i.render.sprite.texture&&!h.wireframes){var j=i.render.sprite,k=b(g,j.texture);h.showSleeping&&i.isSleeping&&(f.globalAlpha=.5),f.translate(i.position.x,i.position.y),f.rotate(i.angle),f.drawImage(k,k.width*-.5*j.xScale,k.height*-.5*j.yScale,k.width*j.xScale,k.height*j.yScale),f.rotate(-i.angle),f.translate(-i.position.x,-i.position.y),h.showSleeping&&i.isSleeping&&(f.globalAlpha=1)}else{if(i.circleRadius)f.beginPath(),f.arc(i.position.x,i.position.y,i.circleRadius,0,2*Math.PI);else{f.beginPath(),f.moveTo(i.vertices[0].x,i.vertices[0].y);for(var l=1;l<i.vertices.length;l++)f.lineTo(i.vertices[l].x,i.vertices[l].y);f.closePath()}h.wireframes?(f.lineWidth=1,f.strokeStyle="#bbb",h.showSleeping&&i.isSleeping&&(f.strokeStyle="rgba(255,255,255,0.2)"),f.stroke()):(f.fillStyle=h.showSleeping&&i.isSleeping?o.shadeColor(i.render.fillStyle,50):i.render.fillStyle,f.lineWidth=i.render.lineWidth,f.strokeStyle=i.render.strokeStyle,f.fill(),f.stroke())}}},A.bodyWireframes=function(a,b,c){var d,e,f=c;for(f.beginPath(),d=0;d<b.length;d++){var g=b[d];if(g.render.visible){for(f.moveTo(g.vertices[0].x,g.vertices[0].y),e=1;e<g.vertices.length;e++)f.lineTo(g.vertices[e].x,g.vertices[e].y);f.lineTo(g.vertices[0].x,g.vertices[0].y)}}f.lineWidth=1,f.strokeStyle="#bbb",f.stroke()},A.bodyBounds=function(a,b,c){var d=c,e=a.render,f=e.options;d.beginPath();for(var g=0;g<b.length;g++){var h=b[g];h.render.visible&&d.rect(h.bounds.min.x,h.bounds.min.y,h.bounds.max.x-h.bounds.min.x,h.bounds.max.y-h.bounds.min.y)}d.strokeStyle=f.wireframes?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.1)",d.lineWidth=1,d.stroke()},A.bodyAxes=function(a,b,c){var d,e,f=c,g=a.render,h=g.options;for(f.beginPath(),d=0;d<b.length;d++){var i=b[d];if(i.render.visible)if(h.showAxes)for(e=0;e<i.axes.length;e++){var j=i.axes[e];f.moveTo(i.position.x,i.position.y),f.lineTo(i.position.x+20*j.x,i.position.y+20*j.y)}else f.moveTo(i.position.x,i.position.y),f.lineTo((i.vertices[0].x+i.vertices[i.vertices.length-1].x)/2,(i.vertices[0].y+i.vertices[i.vertices.length-1].y)/2)}f.strokeStyle=h.wireframes?"indianred":"rgba(0,0,0,0.3)",f.lineWidth=1,f.stroke()},A.bodyPositions=function(a,b,c){var d,e,f=c,g=a.render,h=g.options;for(f.beginPath(),e=0;e<b.length;e++)d=b[e],d.render.visible&&(f.arc(d.position.x,d.position.y,3,0,2*Math.PI,!1),f.closePath());for(f.fillStyle=h.wireframes?"indianred":"rgba(0,0,0,0.5)",f.fill(),f.beginPath(),e=0;e<b.length;e++)d=b[e],d.render.visible&&(f.arc(d.positionPrev.x,d.positionPrev.y,2,0,2*Math.PI,!1),f.closePath());f.fillStyle="rgba(255,165,0,0.8)",f.fill()},A.bodyVelocity=function(a,b,c){{var d=c,e=a.render;e.options}d.beginPath();for(var f=0;f<b.length;f++){var g=b[f];g.render.visible&&(d.moveTo(g.position.x,g.position.y),d.lineTo(g.position.x+2*(g.position.x-g.positionPrev.x),g.position.y+2*(g.position.y-g.positionPrev.y)))}d.lineWidth=3,d.strokeStyle="cornflowerblue",d.stroke()},A.bodyIds=function(a,b,c){for(var d=c,e=0;e<b.length;e++){var f=b[e];f.render.visible&&(d.font="12px Arial",d.fillStyle="rgba(255,255,255,0.5)",d.fillText(f.id,f.position.x+10,f.position.y-10))}},A.collisions=function(a,b,c){var d,e,f,g,h=c,i=a.render.options;for(h.beginPath(),f=0;f<b.length;f++)for(d=b[f],e=d.collision,g=0;g<d.activeContacts.length;g++){var j=d.activeContacts[g],k=j.vertex;h.rect(k.x-1.5,k.y-1.5,3.5,3.5)}for(h.fillStyle=i.wireframes?"rgba(255,255,255,0.7)":"orange",h.fill(),h.beginPath(),f=0;f<b.length;f++)if(d=b[f],e=d.collision,d.activeContacts.length>0){var l=d.activeContacts[0].vertex.x,m=d.activeContacts[0].vertex.y;2===d.activeContacts.length&&(l=(d.activeContacts[0].vertex.x+d.activeContacts[1].vertex.x)/2,m=(d.activeContacts[0].vertex.y+d.activeContacts[1].vertex.y)/2),h.moveTo(l-8*e.normal.x,m-8*e.normal.y),h.lineTo(l,m)}h.strokeStyle=i.wireframes?"rgba(255,165,0,0.7)":"orange",h.lineWidth=1,h.stroke()},A.grid=function(a,b,c){var d=c,e=a.render.options;d.strokeStyle=e.wireframes?"rgba(255,180,0,0.1)":"rgba(255,180,0,0.5)",d.beginPath();for(var f=o.keys(b.buckets),g=0;g<f.length;g++){var h=f[g];if(!(b.buckets[h].length<2)){var i=h.split(",");d.rect(.5+parseInt(i[0],10)*b.bucketWidth,.5+parseInt(i[1],10)*b.bucketHeight,b.bucketWidth,b.bucketHeight)}}d.lineWidth=1,d.stroke()},A.inspector=function(a,b){var c,d=a.engine,e=(d.input.mouse,a.selected),f=d.render,g=f.options;if(g.hasBounds){var h=f.bounds.max.x-f.bounds.min.x,i=f.bounds.max.y-f.bounds.min.y,j=h/f.options.width,k=i/f.options.height;b.scale(1/j,1/k),b.translate(-f.bounds.min.x,-f.bounds.min.y)}for(var l=0;l<e.length;l++){var m=e[l].data;switch(b.translate(.5,.5),b.lineWidth=1,b.strokeStyle="rgba(255,165,0,0.9)",b.setLineDash([1,2]),m.type){case"body":c=m.bounds,b.beginPath(),b.rect(Math.floor(c.min.x-3),Math.floor(c.min.y-3),Math.floor(c.max.x-c.min.x+6),Math.floor(c.max.y-c.min.y+6)),b.closePath(),b.stroke();break;case"constraint":var n=m.pointA;m.bodyA&&(n=m.pointB),b.beginPath(),b.arc(n.x,n.y,10,0,2*Math.PI),b.closePath(),b.stroke()}b.setLineDash([0]),b.translate(-.5,-.5)}null!==a.selectStart&&(b.translate(.5,.5),b.lineWidth=1,b.strokeStyle="rgba(255,165,0,0.6)",b.fillStyle="rgba(255,165,0,0.1)",c=a.selectBounds,b.beginPath(),b.rect(Math.floor(c.min.x),Math.floor(c.min.y),Math.floor(c.max.x-c.min.x),Math.floor(c.max.y-c.min.y)),b.closePath(),b.stroke(),b.fill(),b.translate(-.5,-.5)),g.hasBounds&&b.setTransform(1,0,0,1,0,0)};var a=function(a,b){var c=document.createElement("canvas");return c.width=a,c.height=b,c.oncontextmenu=function(){return!1},c.onselectstart=function(){return!1},c},b=function(a,b){var c=a.textures[b];return c?c:(c=a.textures[b]=new Image,c.src=b,c)}}();var B={};!function(){B.create=function(a){var b={controller:B,element:null,canvas:null,options:{width:800,height:600,background:"#fafafa",wireframeBackground:"#222",enabled:!0,wireframes:!0,showSleeping:!0,showDebug:!1,showBroadphase:!1,showBounds:!1,showVelocity:!1,showCollisions:!1,showAxes:!1,showPositions:!1,showAngleIndicator:!1,showIds:!1,showShadows:!1}},c=o.extend(b,a);return c.context=new PIXI.WebGLRenderer(800,600,c.canvas,!1,!0),c.canvas=c.context.view,c.stage=new PIXI.Stage,c.textures={},c.sprites={},c.primitives={},c.spriteBatch=new PIXI.SpriteBatch,c.stage.addChild(c.spriteBatch),o.isElement(c.element)?c.element.appendChild(c.canvas):o.log('No "render.element" passed, "render.canvas" was not inserted into document.',"warn"),c.canvas.oncontextmenu=function(){return!1},c.canvas.onselectstart=function(){return!1},c},B.clear=function(a){for(var b=a.stage,c=a.spriteBatch;b.children[0];)b.removeChild(b.children[0]);for(;c.children[0];)c.removeChild(c.children[0]);var d=a.sprites["bg-0"];a.textures={},a.sprites={},a.primitives={},a.sprites["bg-0"]=d,d&&c.addChildAt(d,0),a.stage.addChild(a.spriteBatch),a.currentBackground=null},B.setBackground=function(a,b){if(a.currentBackground!==b){var c=b.indexOf&&-1!==b.indexOf("#"),e=a.sprites["bg-0"];if(c){var f=o.colorToNumber(b);a.stage.setBackgroundColor(f),e&&a.spriteBatch.removeChild(e)}else if(!e){var g=d(a,b);e=a.sprites["bg-0"]=new PIXI.Sprite(g),e.position.x=0,e.position.y=0,a.spriteBatch.addChildAt(e,0)}a.currentBackground=b}},B.world=function(a){var b,d=a.render,e=a.world,f=d.context,g=d.stage,h=d.options,i=c.allBodies(e),j=c.allConstraints(e);for(h.wireframes?B.setBackground(d,h.wireframeBackground):B.setBackground(d,h.background),b=0;b<i.length;b++)B.body(a,i[b]);for(b=0;b<j.length;b++)B.constraint(a,j[b]);f.render(g)},B.constraint=function(a,b){var c=a.render,d=b.bodyA,e=b.bodyB,f=b.pointA,g=b.pointB,h=c.stage,i=b.render,j="c-"+b.id,k=c.primitives[j];return k||(k=c.primitives[j]=new PIXI.Graphics),i.visible&&b.pointA&&b.pointB?(-1===h.children.indexOf(k)&&h.addChild(k),k.clear(),k.beginFill(0,0),k.lineStyle(i.lineWidth,o.colorToNumber(i.strokeStyle),1),d?k.moveTo(d.position.x+f.x,d.position.y+f.y):k.moveTo(f.x,f.y),e?k.lineTo(e.position.x+g.x,e.position.y+g.y):k.lineTo(g.x,g.y),void k.endFill()):void k.clear()},B.body=function(c,d){var e=c.render,f=d.render;if(f.visible)if(f.sprite&&f.sprite.texture){var g="b-"+d.id,h=e.sprites[g],i=e.spriteBatch;h||(h=e.sprites[g]=a(e,d)),-1===i.children.indexOf(h)&&i.addChild(h),h.position.x=d.position.x,h.position.y=d.position.y,h.rotation=d.angle}else{var j="b-"+d.id,k=e.primitives[j],l=e.stage;k||(k=e.primitives[j]=b(e,d),k.initialAngle=d.angle),-1===l.children.indexOf(k)&&l.addChild(k),k.position.x=d.position.x,k.position.y=d.position.y,k.rotation=d.angle-k.initialAngle}};var a=function(a,b){var c=b.render,e=c.sprite.texture,f=d(a,e),g=new PIXI.Sprite(f);return g.anchor.x=.5,g.anchor.y=.5,g},b=function(a,b){var c=b.render,d=a.options,e=new PIXI.Graphics;e.clear(),d.wireframes?(e.beginFill(0,0),e.lineStyle(1,o.colorToNumber("#bbb"),1)):(e.beginFill(o.colorToNumber(c.fillStyle),1),e.lineStyle(b.render.lineWidth,o.colorToNumber(c.strokeStyle),1)),e.moveTo(b.vertices[0].x-b.position.x,b.vertices[0].y-b.position.y);for(var f=1;f<b.vertices.length;f++)e.lineTo(b.vertices[f].x-b.position.x,b.vertices[f].y-b.position.y);return e.lineTo(b.vertices[0].x-b.position.x,b.vertices[0].y-b.position.y),e.endFill(),(d.showAngleIndicator||d.showAxes)&&(e.beginFill(0,0),d.wireframes?e.lineStyle(1,o.colorToNumber("#CD5C5C"),1):e.lineStyle(1,o.colorToNumber(b.render.strokeStyle)),e.moveTo(0,0),e.lineTo((b.vertices[0].x+b.vertices[b.vertices.length-1].x)/2-b.position.x,(b.vertices[0].y+b.vertices[b.vertices.length-1].y)/2-b.position.y),e.endFill()),e},d=function(a,b){var c=a.textures[b];return c||(c=a.textures[b]=PIXI.Texture.fromImage(b)),c}}(),d.add=c.add,d.remove=c.remove,d.addComposite=c.addComposite,d.addBody=c.addBody,d.addConstraint=c.addConstraint,d.clear=c.clear,a.Body=b,a.Composite=c,a.World=d,a.Contact=e,a.Detector=f,a.Grid=g,a.Pairs=i,a.Pair=h,a.Resolver=k,a.SAT=l,a.Constraint=m,a.MouseConstraint=n,a.Common=o,a.Engine=p,a.Metrics=r,a.Mouse=s,a.Sleeping=t,a.Bodies=u,a.Composites=v,a.Axes=w,a.Bounds=x,a.Vector=y,a.Vertices=z,a.Render=A,a.RenderPixi=B,a.Events=q,a.Query=j,"undefined"!=typeof exports&&("undefined"!=typeof module&&module.exports&&(exports=module.exports=a),exports.Matter=a),"function"==typeof define&&define.amd&&define("Matter",[],function(){return a}),"object"==typeof window&&"object"==typeof window.document&&(window.Matter=a)}();
define("matter", function(){});

/*
*
*   App/Fence
*
*   @author Yuji Ito @110chang
*
*/

define('app/fence',[
  'mod/extend',
  'app/cnf',
  'matter'
], function(extend, cnf, M) {
  M = M || window.Matter;
  var abs = Math.abs;
  var pow = Math.pow;

  function Fence() {
    this.bodies = [];
  }
  extend(Fence.prototype, {
    bodies: null,

    create: function(engine) {
      var i, x, y, w, h;
      var body;
      var CW = cnf.CANVAS_WIDTH;
      var CH = cnf.CANVAS_HEIGHT;
      var SCALE = cnf.SCALE;

      for (i = 0; i < 4; i++) {
        x = CW * (1 - abs(1 - i) / 2) / SCALE;
        y = CH * (1 - abs(2 - i) / 2) / SCALE;
        w = pow(CW, (i + 1) % 2) + pow(20, i % 2) / SCALE;
        h = pow(CH, i % 2) + pow(20, (i + 1) % 2) / SCALE;

        body = M.Bodies.rectangle(x, y, w, h, {
          isStatic: true,
          render: {
            fillStyle: 'rgba(64, 64, 64, 0.8)',
            strokeStyle: 'rgba(255, 255, 255, 0.8)',
            lineWidth: 1
          }
        });

        this.bodies.push(body);
      }
      M.World.add(engine.world, this.bodies);
    },
    break: function() {
      //console.log(this.bodies);
      this.bodies.forEach(function(body) {
        M.Body.setStatic(body, false);
        //M.Body.resetForcesAll(body);
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
      });
    }
  });

  return Fence;
});

/*
*
*   App/Hitsuji
*
*   @author Yuji Ito @110chang
*
*/

define('app/hitsuji',[
  'mod/extend',
  'app/cnf',
  'matter'
], function(extend, cnf, M) {
  M = M || window.Matter;
  var random = M.Common.random;

  function Hitsuji(x, y) {
    x = x || cnf.CANVAS_WIDTH / 2;
    y = y || cnf.CANVAS_HEIGHT / 2;
    this.center = { x: x, y: y };
  }
  extend(Hitsuji.prototype, {
    center: null,

    create: function(engine) {
      var hitsuji;
      var x = 40 + random(0, 6) * 40;//this.center.x;
      var y = 40;//this.center.y;
      var force = { x: random(-0.01, 0.01), y: random(-0.01, 0.01) };

      hitsuji = M.Composites.softBody(x, y, 4, 3, 0, 0, true, 20, {}, {
        render: {
          visible: false
        }
      });
      hitsuji.bodies.forEach(function(body, i) {
        if (i === 0) {
          body.render.sprite.texture = './img/legFL.png';
        } else if (i === 3) {
          body.render.sprite.texture = './img/legBL.png';
        } else if (i === 4) {
          body.render.sprite.texture = './img/head.png';
        } else if (i === 7) {
          body.render.sprite.texture = './img/tail.png';
        } else if (i === 8) {
          body.render.sprite.texture = './img/legFR.png';
        } else if (i === 11) {
          body.render.sprite.texture = './img/legBR.png';
        } else {
          body.render.sprite.texture = './img/bodyTop.png';
        }
      });
      M.Body.applyForce(hitsuji.bodies[0], hitsuji.bodies[0].position, force);
      M.World.add(engine.world, [hitsuji]);
    }
  });

  return Hitsuji;
});

/*
*
*   App/Charactors
*
*   @author Yuji Ito @110chang
*
*/

define('app/charactors',[], function() {
  return {
    A: {
      path: '0.4,60 34.9,0 69.3,60',
      width: 60,
      supple: { x: 6, y: 9 }
    },
    H: {
      path: '30,2 30,20.3 20,20.3 20,2 0,2 0,60 20,60 20,40.3 30,40.3 30,60 50,60 50,2',
      width: 50,
      supple: { x: 0, y: 0 }
    },
    P: {
      path: '47.3,10.7 41.6,5 34.2,2 20,2 0,2 0,60 20,60 20,42 34.2,42 41.6,39 47.3,33.3 50.4,26 50.4,18',
      width: 50,
      supple: { x: 0, y: -5 }
    },
    Y: {
      path: '60,2 0,2 20,36.6 20,60 40,60 40,36.6',
      width: 50,
      supple: { x: 0, y: -8 }
    },
    N: {
      path: '30,2 30,36 0,0 0,60 50,60 50,2',
      width: 50,
      supple: { x: 0, y: 3 }
    },
    E: {
      path: '50,2 0,2 0,60 50,60 50,41 20,41 37.3,31 20,21 50,21',
      width: 50,
      supple: { x: 0, y: 0 }
    },
    W: {
      path: '70,2 0,2 20,62 35,17 50,62',
      width: 70,
      supple: { x: 8, y: -8 }
    },
    R: {
      path: '47.3,10.7 41.6,5 34.2,2 20,2 0,2 0,60 43,60 20,42 34.2,42 41.6,39 47.3,33.3 50.4,26 50.4,18',
      width: 50,
      supple: { x: 0, y: -3 }
    },
    n2: {
      path: '50,22 46.2,12.8 39.2,5.8 30,2 20,2 10.8,5.8 3.8,12.8 0,22 0,32 23.8,32 0,60 50,60 50,42 41.5,42 50,32',
      width: 50,
      supple: { x: 0, y: 0 }
    },
    n0: {
      path: '23.2,60 12.6,55.6 4.4,47.4 0,36.8 0,25.2 4.4,14.6 12.6,6.4 23.2,2 34.8,2 45.4,6.4 53.6,14.6 58,25.2 58,36.8 53.6,47.4 45.4,55.6 34.8,60',
      width: 60,
      supple: { x: 0, y: 0 }
    },
    n1: {
      path: '20,60 0,60 0,20 20,0',
      width: 20,
      supple: { x: -18, y: 3 }
    },
    n5: {
      path: '50,2 0,2 0,40 20,40 0,60 34,60 41.3,57 47,51.3 50,44 50,36 47,28.7 41.3,23 34,20 50,20',
      width: 50,
      supple: { x: 0, y: -3 }
    }
  };
});

/*
*
*   App/Title
*
*   @author Yuji Ito @110chang
*
*/

define('app/title',[
  'mod/extend',
  'app/cnf',
  'app/charactors',
  'matter'
], function(extend, cnf, charactors, M) {
  M = M || window.Matter;
  var CW, CH, SCALE;

  function Title(msg) {
    CW = cnf.CANVAS_WIDTH;
    CH = cnf.CANVAS_HEIGHT;
    SCALE = cnf.SCALE;

    this.msg = msg || '';
    this.center = { x: CW / 2, y: CH / 2 };
  }
  extend(Title.prototype, {
    msg: '',
    composite: null,

    create: function(engine) {
      var title = M.Composite.create();
      var i = 0;
      var x = 60, y = 60;
      var chr, path, body;

      for (; i < this.msg.length; i++) {
        chr = this.msg[i];
        if (/[0-9]/.test(chr)) {
          chr = 'n' + chr;
        }
        if (chr === '\n') {
          x = 60;
          y += 80;
          continue;
        }
        if (/\s+/.test(chr)) {
          x += 50;
          continue;
        }
        path = this._svgToPath(charactors[chr].path);
        body = M.Body.create({
          label: 'Title-' + chr,
          position: {
            x: x + charactors[chr].supple.x,
            y: y + charactors[chr].supple.y
          },
          vertices: M.Vertices.fromPath(path),
          restitution: 0.9
        });
        M.Composite.add(title, body);
        x += charactors[chr].width + 10;
      }
      this.composite = title;
      M.World.add(engine.world, title);

      return title;
    },
    _svgToPath: function(str) {
      return str.split(' ').map(function(e) {
        return 'L' + e.split(',').join(' ');
      }).join(' ');
    }
  });

  return Title;
});

/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery'           : 'lib/jquery.min',
    'matter'           : 'lib/matter-0.8.0.min',
    'mod'              : 'mod'
  }
});

require([
  'jquery',
  'mod/screen',
  'mod/timer',
  'app/cnf',
  'app/fence',
  'app/hitsuji',
  'app/title',
  'matter'
], function($, Screen, Timer, cnf, Fence, Hitsuji, Title, M) {
  $(function() {
    //console.log('DOM ready.');
    var M = M || window.Matter;
    var dpr = window.devicePixelRatio || 1;
    var $stage, $canvas, $toggle;
    var engine, mouseConstraint, fence, title, bounds;
    var timer0, timer1;
    var maxBodyNum = 0;
    var broke = false;
    var wireframe = false;
    var CW, CH;

    function init() {
      CW = cnf.CANVAS_WIDTH = Screen().width() * dpr;
      CH = cnf.CANVAS_HEIGHT = Screen().height() * dpr;

      $stage = $('#stage').css({
        width: CW / dpr,
        height: CH / dpr
      }).empty();

      engine = M.Engine.create(
        $stage.get(0),
        M.Common.extend(cnf.prodOptions, {
          render: {
            options: {
              width: CW,
              height: CH,
            }
          }
        }
      ));
      M.Engine.run(engine);

      $canvas = $stage.children('canvas').css({
        width: CW / dpr,
        height: CH / dpr
      });

      $toggle = $('#toggle-wireframe');
      $toggle.on('click', function(e) {
        toggleWireframe();
      });

      bounds = M.Bounds.create([{ x: 0, y: 0 }, { x: CW, y: CH }]);
      maxBodyNum = ~~(Math.pow(CW * CH, 1 / 3) * 2 / dpr);
      //console.log(maxBodyNum);
      reset();
    }
    function reset() {
      M.World.clear(engine.world);
      M.Engine.clear(engine);
      engine.timing.timeScale = 1;
      engine.world.gravity.x = 0;
      engine.world.gravity.y = 1;
      engine.world.bounds.max.x = CW;
      engine.world.bounds.max.y = CH;
      engine.render.options.width = CW;
      engine.render.options.height = CH;
      //console.log(engine.timing.timeScale);
      mouseConstraint = M.MouseConstraint.create(engine);
      M.World.add(engine.world, mouseConstraint);

      fence = new Fence();
      fence.create(engine);

      title = new Title('A HAPPY\nNEW YEAR\n2015');
      title.create(engine);

      timer0 = new Timer(3000);
      timer1 = new Timer(3000, -1);

      timer0.subscribe(Timer.TIMER, function(e) {
        //console.log('time begins to move');
        resume();
        timer1.start();
      });
      timer1.subscribe(Timer.TIMER, function(e) {
        //console.log('create hitsuji');
        //console.log(M.Composite.allBodies(engine.world).length);
        (new Hitsuji()).create(engine);
      });
      timer0.start();

      broke = false;

      M.Events.on(engine, 'afterRender', onAfterRender);

      pause();
    }
    function pause() {
      engine.timing.timeScale = 0;
    }
    function resume() {
      engine.timing.timeScale = 1;
      M.Composite.allBodies(engine.world).forEach(function(body) {
        M.Body.resetForcesAll(body);
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
      });
    }
    function onAfterRender(e) {
      var count = M.Composite.allBodies(engine.world).length;
      var inBounds = false;
      //console.log(count);
      if (count > maxBodyNum) {
        engine.world.bounds.max.y = CH * 2;
        engine.render.options.height = CH * 2;
        fence.break();
        broke = true;
        timer1.stop();
      }
      M.Composite.allBodies(engine.world).forEach(function(body) {
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
        if (M.Bounds.contains(bounds, body.position)) {
          inBounds = true;
        }
      });
      if (broke && !inBounds) {
        //console.log('afterRender end');
        M.Events.off(engine, 'afterRender');
        reset();
      }
    }
    function toggleWireframe() {
      wireframe = !wireframe;
      if (wireframe) {
        engine.render.options.wireframes = true;
        engine.render.options.showSleeping = true;
        engine.render.options.showAngleIndicator = true;
        engine.render.options.showVelocity = true;
        engine.render.options.showCollisions = true;
      } else {
        engine.render.options.wireframes = false;
        engine.render.options.showSleeping = false;
        engine.render.options.showAngleIndicator = false;
        engine.render.options.showVelocity = false;
        engine.render.options.showCollisions = false;
      }
      $toggle.toggleClass('on');
    }
    init();
  });
});


define("main", function(){});

}());
