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

/*!
 * jQuery JavaScript Library v2.1.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-18T15:11Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Support: Firefox 18+
// Can't be in strict mode, several libs including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
//

var arr = [];

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var support = {};



var
	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	version = "2.1.3",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android<4.1
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return just the one element from the set
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return all the elements in a clean array
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray,

	isWindow: function( obj ) {
		return obj != null && obj === obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		// adding 1 corrects loss of precision from parseFloat (#15100)
		return !jQuery.isArray( obj ) && (obj - parseFloat( obj ) + 1) >= 0;
	},

	isPlainObject: function( obj ) {
		// Not plain objects:
		// - Any object or value whose internal [[Class]] property is not "[object Object]"
		// - DOM nodes
		// - window
		if ( jQuery.type( obj ) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		if ( obj.constructor &&
				!hasOwn.call( obj.constructor.prototype, "isPrototypeOf" ) ) {
			return false;
		}

		// If the function hasn't returned already, we're confident that
		// |obj| is a plain object, created by {} or constructed with new Object
		return true;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		// Support: Android<4.0, iOS<6 (functionish RegExp)
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		var script,
			indirect = eval;

		code = jQuery.trim( code );

		if ( code ) {
			// If the code includes a valid, prologue position
			// strict mode pragma, execute code by injecting a
			// script tag into the document.
			if ( code.indexOf("use strict") === 1 ) {
				script = document.createElement("script");
				script.text = code;
				document.head.appendChild( script ).parentNode.removeChild( script );
			} else {
			// Otherwise, avoid the DOM node creation, insertion
			// and removal by using an indirect global eval
				indirect( code );
			}
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Support: IE9-11+
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Support: Android<4.1
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: Date.now,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.2.0-pre
 * http://sizzlejs.com/
 *
 * Copyright 2008, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-16
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// http://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + characterEncoding + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];
	nodeType = context.nodeType;

	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	if ( !seed && documentIsHTML ) {

		// Try to shortcut find operations when possible (e.g., not under DocumentFragment)
		if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType !== 1 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, parent,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;
	parent = doc.defaultView;

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", unloadHandler, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Support tests
	---------------------------------------------------------------------- */
	documentIsHTML = !isXML( doc );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [ m ] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			docElem.appendChild( div ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\f]' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( div.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.2+, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.7+
			if ( !div.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibing-combinator selector` fails
			if ( !div.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is no seed and only one group
	if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				support.getById && context.nodeType === 9 && documentIsHTML &&
				Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( indexOf.call( qualifier, elem ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			len = this.length,
			ret = [],
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[0] === "<" && selector[ selector.length - 1 ] === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Support: Blackberry 4.6
					// gEBID returns nodes no longer in the document (#6963)
					if ( elem && elem.parentNode ) {
						// Inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			truncate = until !== undefined;

		while ( (elem = elem[ dir ]) && elem.nodeType !== 9 ) {
			if ( elem.nodeType === 1 ) {
				if ( truncate && jQuery( elem ).is( until ) ) {
					break;
				}
				matched.push( elem );
			}
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var matched = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				matched.push( n );
			}
		}

		return matched;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter(function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	while ( (cur = cur[dir]) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return elem.contentDocument || jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.unique( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// Add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// If we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.triggerHandler ) {
			jQuery( document ).triggerHandler( "ready" );
			jQuery( document ).off( "ready" );
		}
	}
});

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed, false );
	window.removeEventListener( "load", completed, false );
	jQuery.ready();
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// We once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		} else {

			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );
		}
	}
	return readyList.promise( obj );
};

// Kick off the DOM ready check even if the user does not
jQuery.ready.promise();




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			len ? fn( elems[0], key ) : emptyGet;
};


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( owner ) {
	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	/* jshint -W018 */
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};


function Data() {
	// Support: Android<4,
	// Old WebKit does not have Object.preventExtensions/freeze method,
	// return new empty object instead with no [[set]] accessor
	Object.defineProperty( this.cache = {}, 0, {
		get: function() {
			return {};
		}
	});

	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;
Data.accepts = jQuery.acceptData;

Data.prototype = {
	key: function( owner ) {
		// We can accept data for non-element nodes in modern browsers,
		// but we should not, see #8335.
		// Always return the key for a frozen object.
		if ( !Data.accepts( owner ) ) {
			return 0;
		}

		var descriptor = {},
			// Check if the owner object already has a cache key
			unlock = owner[ this.expando ];

		// If not, create one
		if ( !unlock ) {
			unlock = Data.uid++;

			// Secure it in a non-enumerable, non-writable property
			try {
				descriptor[ this.expando ] = { value: unlock };
				Object.defineProperties( owner, descriptor );

			// Support: Android<4
			// Fallback to a less secure definition
			} catch ( e ) {
				descriptor[ this.expando ] = unlock;
				jQuery.extend( owner, descriptor );
			}
		}

		// Ensure the cache object
		if ( !this.cache[ unlock ] ) {
			this.cache[ unlock ] = {};
		}

		return unlock;
	},
	set: function( owner, data, value ) {
		var prop,
			// There may be an unlock assigned to this node,
			// if there is no entry for this "owner", create one inline
			// and set the unlock as though an owner entry had always existed
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		// Handle: [ owner, key, value ] args
		if ( typeof data === "string" ) {
			cache[ data ] = value;

		// Handle: [ owner, { properties } ] args
		} else {
			// Fresh assignments by object are shallow copied
			if ( jQuery.isEmptyObject( cache ) ) {
				jQuery.extend( this.cache[ unlock ], data );
			// Otherwise, copy the properties one-by-one to the cache object
			} else {
				for ( prop in data ) {
					cache[ prop ] = data[ prop ];
				}
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		// Either a valid cache is found, or will be created.
		// New caches will be created and the unlock returned,
		// allowing direct access to the newly created
		// empty data object. A valid owner object must be provided.
		var cache = this.cache[ this.key( owner ) ];

		return key === undefined ?
			cache : cache[ key ];
	},
	access: function( owner, key, value ) {
		var stored;
		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				((key && typeof key === "string") && value === undefined) ) {

			stored = this.get( owner, key );

			return stored !== undefined ?
				stored : this.get( owner, jQuery.camelCase(key) );
		}

		// [*]When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i, name, camel,
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		if ( key === undefined ) {
			this.cache[ unlock ] = {};

		} else {
			// Support array or space separated string of keys
			if ( jQuery.isArray( key ) ) {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = key.concat( key.map( jQuery.camelCase ) );
			} else {
				camel = jQuery.camelCase( key );
				// Try the string as a key before any manipulation
				if ( key in cache ) {
					name = [ key, camel ];
				} else {
					// If a key with the spaces exists, use it.
					// Otherwise, create an array by matching non-whitespace
					name = camel;
					name = name in cache ?
						[ name ] : ( name.match( rnotwhite ) || [] );
				}
			}

			i = name.length;
			while ( i-- ) {
				delete cache[ name[ i ] ];
			}
		}
	},
	hasData: function( owner ) {
		return !jQuery.isEmptyObject(
			this.cache[ owner[ this.expando ] ] || {}
		);
	},
	discard: function( owner ) {
		if ( owner[ this.expando ] ) {
			delete this.cache[ owner[ this.expando ] ];
		}
	}
};
var data_priv = new Data();

var data_user = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			data_user.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend({
	hasData: function( elem ) {
		return data_user.hasData( elem ) || data_priv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return data_user.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		data_user.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to data_priv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return data_priv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		data_priv.remove( elem, name );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = data_user.get( elem );

				if ( elem.nodeType === 1 && !data_priv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE11+
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = jQuery.camelCase( name.slice(5) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					data_priv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				data_user.set( this, key );
			});
		}

		return access( this, function( value ) {
			var data,
				camelKey = jQuery.camelCase( key );

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {
				// Attempt to get data from the cache
				// with the key as-is
				data = data_user.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to get data from the cache
				// with the key camelized
				data = data_user.get( elem, camelKey );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, camelKey, undefined );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each(function() {
				// First, attempt to store a copy or reference of any
				// data that might've been store with a camelCased key.
				var data = data_user.get( this, camelKey );

				// For HTML5 data-* attribute interop, we have to
				// store property names with dashes in a camelCase form.
				// This might not apply to all properties...*
				data_user.set( this, camelKey, value );

				// *... In the case of properties that might _actually_
				// have dashes, we need to also store a copy of that
				// unchanged property.
				if ( key.indexOf("-") !== -1 && data !== undefined ) {
					data_user.set( this, key, value );
				}
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			data_user.remove( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = data_priv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray( data ) ) {
					queue = data_priv.access( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return data_priv.get( elem, key ) || data_priv.access( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				data_priv.remove( elem, [ type + "queue", key ] );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = data_priv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};

var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Safari<=5.1
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Safari<=5.1, Android<4.2
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<=11+
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
})();
var strundefined = typeof undefined;



support.focusinBubbles = "onfocusin" in window;


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.hasData( elem ) && data_priv.get( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;
			data_priv.remove( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( data_priv.get( cur, "events" ) || {} )[ event.type ] && data_priv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && jQuery.isFunction( elem[ type ] ) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, j, ret, matched, handleObj,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( data_priv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or 2) have namespace(s)
				// a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, matches, sel, handleObj,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: Cordova 2.5 (WebKit) (#13255)
		// All events should have a target; Cordova deviceready doesn't
		if ( !event.target ) {
			event.target = document;
		}

		// Support: Safari 6.0+, Chrome<28
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && jQuery.nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, false );
	}
};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&
				// Support: Android<4.0
				src.returnValue === false ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && e.preventDefault ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && e.stopPropagation ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && e.stopImmediatePropagation ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
// Support: Chrome 15+
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// Support: Firefox, Chrome, Safari
// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				data_priv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					data_priv.remove( doc, fix );

				} else {
					data_priv.access( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


var
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {

		// Support: IE9
		option: [ 1, "<select multiple='multiple'>", "</select>" ],

		thead: [ 1, "<table>", "</table>" ],
		col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		_default: [ 0, "", "" ]
	};

// Support: IE9
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: 1.x compatibility
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );

	if ( match ) {
		elem.type = match[ 1 ];
	} else {
		elem.removeAttribute("type");
	}

	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		data_priv.set(
			elems[ i ], "globalEval", !refElements || data_priv.get( refElements[ i ], "globalEval" )
		);
	}
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( data_priv.hasData( src ) ) {
		pdataOld = data_priv.access( src );
		pdataCur = data_priv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( data_user.hasData( src ) ) {
		udataOld = data_user.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		data_user.set( dest, udataCur );
	}
}

function getAll( context, tag ) {
	var ret = context.getElementsByTagName ? context.getElementsByTagName( tag || "*" ) :
			context.querySelectorAll ? context.querySelectorAll( tag || "*" ) :
			[];

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], ret ) :
		ret;
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var elem, tmp, tag, wrap, contains, j,
			fragment = context.createDocumentFragment(),
			nodes = [],
			i = 0,
			l = elems.length;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || fragment.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					tmp.innerHTML = wrap[ 1 ] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[ 2 ];

					// Descend through wrappers to the right content
					j = wrap[ 0 ];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, tmp.childNodes );

					// Remember the top-level container
					tmp = fragment.firstChild;

					// Ensure the created nodes are orphaned (#12392)
					tmp.textContent = "";
				}
			}
		}

		// Remove wrapper from fragment
		fragment.textContent = "";

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( fragment.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		return fragment;
	},

	cleanData: function( elems ) {
		var data, elem, type, key,
			special = jQuery.event.special,
			i = 0;

		for ( ; (elem = elems[ i ]) !== undefined; i++ ) {
			if ( jQuery.acceptData( elem ) ) {
				key = elem[ data_priv.expando ];

				if ( key && (data = data_priv.cache[ key ]) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}
					if ( data_priv.cache[ key ] ) {
						// Discard any remaining `private` data
						delete data_priv.cache[ key ];
					}
				}
			}
			// Discard any remaining `user` data
			delete data_user.cache[ elem[ data_user.expando ] ];
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each(function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				});
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var fragment, first, scripts, hasScripts, node, doc,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[ 0 ],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[ 0 ] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							// Support: QtWebKit
							// jQuery.merge because push.apply(_, arraylike) throws
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[ i ], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!data_priv.access( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( node.textContent.replace( rcleanScript, "" ) );
							}
						}
					}
				}
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: QtWebKit
			// .get() because push.apply(_, arraylike) throws
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var style,
		elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle && ( style = window.getDefaultComputedStyle( elem[ 0 ] ) ) ?

			// Use of this method is a temporary fix (more like optimization) until something better comes along,
			// since it was removed from specification and supported only in FF
			style.display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = iframe[ 0 ].contentDocument;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {
		// Support: IE<=11+, Firefox<=30+ (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		if ( elem.ownerDocument.defaultView.opener ) {
			return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
		}

		return window.getComputedStyle( elem, null );
	};



function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,
		style = elem.style;

	computed = computed || getStyles( elem );

	// Support: IE9
	// getPropertyValue is only needed for .css('filter') (#12537)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];
	}

	if ( computed ) {

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// Support: iOS < 6
		// A tribute to the "awesome hack by Dean Edwards"
		// iOS < 6 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
		// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?
		// Support: IE
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {
				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var pixelPositionVal, boxSizingReliableVal,
		docElem = document.documentElement,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	if ( !div.style ) {
		return;
	}

	// Support: IE9-11+
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" +
		"position:absolute";
	container.appendChild( div );

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computePixelPositionAndBoxSizingReliable() {
		div.style.cssText =
			// Support: Firefox<29, Android 2.3
			// Vendor-prefix box-sizing
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" +
			"box-sizing:border-box;display:block;margin-top:1%;top:1%;" +
			"border:1px;padding:1px;width:4px;position:absolute";
		div.innerHTML = "";
		docElem.appendChild( container );

		var divStyle = window.getComputedStyle( div, null );
		pixelPositionVal = divStyle.top !== "1%";
		boxSizingReliableVal = divStyle.width === "4px";

		docElem.removeChild( container );
	}

	// Support: node.js jsdom
	// Don't assume that getComputedStyle is a property of the global object
	if ( window.getComputedStyle ) {
		jQuery.extend( support, {
			pixelPosition: function() {

				// This test is executed only once but we still do memoizing
				// since we can use the boxSizingReliable pre-computing.
				// No need to check if the test was already performed, though.
				computePixelPositionAndBoxSizingReliable();
				return pixelPositionVal;
			},
			boxSizingReliable: function() {
				if ( boxSizingReliableVal == null ) {
					computePixelPositionAndBoxSizingReliable();
				}
				return boxSizingReliableVal;
			},
			reliableMarginRight: function() {

				// Support: Android 2.3
				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// This support function is only executed once so no memoizing is needed.
				var ret,
					marginDiv = div.appendChild( document.createElement( "div" ) );

				// Reset CSS: box-sizing; display; margin; border; padding
				marginDiv.style.cssText = div.style.cssText =
					// Support: Firefox<29, Android 2.3
					// Vendor-prefix box-sizing
					"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
					"box-sizing:content-box;display:block;margin:0;border:0;padding:0";
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";
				docElem.appendChild( container );

				ret = !parseFloat( window.getComputedStyle( marginDiv, null ).marginRight );

				docElem.removeChild( container );
				div.removeChild( marginDiv );

				return ret;
			}
		});
	}
})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
	// Swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// Return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// Shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// Check for vendor prefixed names
	var capName = name[0].toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// Both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// At this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// At this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// At this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// Some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// Check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox &&
			( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// Use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = data_priv.get( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = data_priv.access( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {
			hidden = isHidden( elem );

			if ( display !== "none" || !hidden ) {
				data_priv.set( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.extend({

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		"float": "cssFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Support: IE9-11+
			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				style[ name ] = value;
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) && elem.offsetWidth === 0 ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

// Support: Android 2.3
jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE9
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*.
					// Use string for doubling so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur(),
				// break the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, checkDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = data_priv.get( elem, "fxshow" );

	// Handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// Ensure the complete handler is called before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// Height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE9-10 do not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );

		// Test default display if display is currently "none"
		checkDisplay = display === "none" ?
			data_priv.get( elem, "olddisplay" ) || defaultDisplay( elem.nodeName ) : display;

		if ( checkDisplay === "inline" && jQuery.css( elem, "float" ) === "none" ) {
			style.display = "inline-block";
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always(function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		});
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );

		// Any non-fx value stops us from restoring the original display value
		} else {
			display = undefined;
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = data_priv.access( elem, "fxshow", {} );
		}

		// Store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;

			data_priv.remove( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}

	// If this is a noop like .hide().hide(), restore an overwritten display value
	} else if ( (display === "none" ? defaultDisplay( elem.nodeName ) : display) === "inline" ) {
		style.display = display;
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// Don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// Support: Android 2.3
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || data_priv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = data_priv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = data_priv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: iOS<=5.1, Android<=4.2+
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE<=11+
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: Android<=2.3
	// Options inside disabled selects are incorrectly marked as disabled
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE<=11+
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
})();


var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					elem[ propName ] = false;
				}

				elem.removeAttribute( name );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					jQuery.nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle;
		if ( !isXML ) {
			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ name ];
			attrHandle[ name ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				name.toLowerCase() :
				null;
			attrHandle[ name ] = handle;
		}
		return ret;
	};
});




var rfocusable = /^(?:input|select|textarea|button)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each(function() {
			delete this[ jQuery.propFix[ name ] || name ];
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				return elem.hasAttribute( "tabindex" ) || rfocusable.test( elem.nodeName ) || elem.href ?
					elem.tabIndex :
					-1;
			}
		}
	}
});

if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = arguments.length === 0 || typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// Toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					data_priv.set( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : data_priv.get( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// Handle most common string cases
					ret.replace(rreturn, "") :
					// Handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					// Support: IE10-11+
					// option.text throws exceptions (#14686, #14858)
					jQuery.trim( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// IE6-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute( "disabled" ) === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];
					if ( (option.selected = jQuery.inArray( option.value, values ) >= 0) ) {
						optionSet = true;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



// Support: Android 2.3
// Workaround failure to string-cast null input
jQuery.parseJSON = function( data ) {
	return JSON.parse( data + "" );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE9
	try {
		tmp = new DOMParser();
		xml = tmp.parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Document location
	ajaxLocation = window.location.href,

	// Segment location into parts
	ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

		// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,
			// URL without anti-cache param
			cacheURL,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" )
			.replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// Shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		var wrap;

		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapAll( html.call(this, i) );
			});
		}

		if ( this[ 0 ] ) {

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function( i ) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
};
jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


jQuery.ajaxSettings.xhr = function() {
	try {
		return new XMLHttpRequest();
	} catch( e ) {}
};

var xhrId = 0,
	xhrCallbacks = {},
	xhrSuccessStatus = {
		// file protocol always yields status code 0, assume 200
		0: 200,
		// Support: IE9
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE9
// Open requests must be manually aborted on unload (#5280)
// See https://support.microsoft.com/kb/2856746 for more info
if ( window.attachEvent ) {
	window.attachEvent( "onunload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]();
		}
	});
}

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport(function( options ) {
	var callback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr(),
					id = ++xhrId;

				xhr.open( options.type, options.url, options.async, options.username, options.password );

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers["X-Requested-With"] ) {
					headers["X-Requested-With"] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							delete xhrCallbacks[ id ];
							callback = xhr.onload = xhr.onerror = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {
								complete(
									// file: protocol always yields status 0; see #8605, #14207
									xhr.status,
									xhr.statusText
								);
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,
									// Support: IE9
									// Accessing binary-data responseText throws an exception
									// (#11426)
									typeof xhr.responseText === "string" ? {
										text: xhr.responseText
									} : undefined,
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				xhr.onerror = callback("error");

				// Create the abort callback
				callback = xhrCallbacks[ id ] = callback("abort");

				try {
					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {
					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery("<script>").prop({
					async: true,
					charset: s.scriptCharset,
					src: s.url
				}).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = jQuery.trim( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};




var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ? elem : elem.nodeType === 9 && elem.defaultView;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf("auto") > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			elem = this[ 0 ],
			box = { top: 0, left: 0 },
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// Support: BlackBerry 5, iOS 3 (original iPhone)
		// If we don't have gBCR, just use 0,0 rather than error
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top + win.pageYOffset - docElem.clientTop,
			left: box.left + win.pageXOffset - docElem.clientLeft
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// Fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// Assume getBoundingClientRect is there when computed position is fixed
			offset = elem.getBoundingClientRect();

		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : window.pageXOffset,
					top ? val : window.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Support: Safari<7+, Chrome<37+
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://code.google.com/p/chromium/issues/detail?id=229280
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

/*
 * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
 *
 * Uses the built in easing capabilities added In jQuery 1.1
 * to offer multiple easing options
 *
 * TERMS OF USE - jQuery Easing
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2008 George McGinley Smith
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
*/

// t: current time, b: begInnIng value, c: change In value, d: duration
jQuery.easing['jswing'] = jQuery.easing['swing'];

jQuery.extend( jQuery.easing,
{
	def: 'easeOutQuad',
	swing: function (x, t, b, c, d) {
		//alert(jQuery.easing.default);
		return jQuery.easing[jQuery.easing.def](x, t, b, c, d);
	},
	easeInQuad: function (x, t, b, c, d) {
		return c*(t/=d)*t + b;
	},
	easeOutQuad: function (x, t, b, c, d) {
		return -c *(t/=d)*(t-2) + b;
	},
	easeInOutQuad: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t + b;
		return -c/2 * ((--t)*(t-2) - 1) + b;
	},
	easeInCubic: function (x, t, b, c, d) {
		return c*(t/=d)*t*t + b;
	},
	easeOutCubic: function (x, t, b, c, d) {
		return c*((t=t/d-1)*t*t + 1) + b;
	},
	easeInOutCubic: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t + b;
		return c/2*((t-=2)*t*t + 2) + b;
	},
	easeInQuart: function (x, t, b, c, d) {
		return c*(t/=d)*t*t*t + b;
	},
	easeOutQuart: function (x, t, b, c, d) {
		return -c * ((t=t/d-1)*t*t*t - 1) + b;
	},
	easeInOutQuart: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
		return -c/2 * ((t-=2)*t*t*t - 2) + b;
	},
	easeInQuint: function (x, t, b, c, d) {
		return c*(t/=d)*t*t*t*t + b;
	},
	easeOutQuint: function (x, t, b, c, d) {
		return c*((t=t/d-1)*t*t*t*t + 1) + b;
	},
	easeInOutQuint: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
		return c/2*((t-=2)*t*t*t*t + 2) + b;
	},
	easeInSine: function (x, t, b, c, d) {
		return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
	},
	easeOutSine: function (x, t, b, c, d) {
		return c * Math.sin(t/d * (Math.PI/2)) + b;
	},
	easeInOutSine: function (x, t, b, c, d) {
		return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
	},
	easeInExpo: function (x, t, b, c, d) {
		return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
	},
	easeOutExpo: function (x, t, b, c, d) {
		return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
	},
	easeInOutExpo: function (x, t, b, c, d) {
		if (t==0) return b;
		if (t==d) return b+c;
		if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
		return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
	},
	easeInCirc: function (x, t, b, c, d) {
		return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
	},
	easeOutCirc: function (x, t, b, c, d) {
		return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
	},
	easeInOutCirc: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
		return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
	},
	easeInElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
	},
	easeOutElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
	},
	easeInOutElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
		return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
	},
	easeInBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158;
		return c*(t/=d)*t*((s+1)*t - s) + b;
	},
	easeOutBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158;
		return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
	},
	easeInOutBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158; 
		if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
		return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
	},
	easeInBounce: function (x, t, b, c, d) {
		return c - jQuery.easing.easeOutBounce (x, d-t, 0, c, d) + b;
	},
	easeOutBounce: function (x, t, b, c, d) {
		if ((t/=d) < (1/2.75)) {
			return c*(7.5625*t*t) + b;
		} else if (t < (2/2.75)) {
			return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
		} else if (t < (2.5/2.75)) {
			return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
		} else {
			return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
		}
	},
	easeInOutBounce: function (x, t, b, c, d) {
		if (t < d/2) return jQuery.easing.easeInBounce (x, t*2, 0, c, d) * .5 + b;
		return jQuery.easing.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
	}
});

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2001 Robert Penner
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
 */;
define("jquery.easing", function(){});

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
*   Nav.Anchor r1
*
*   @author Yuji Ito @110chang
*
*/

define('mod/nav/anchor',[
  'jquery',
  'jquery.easing',
  'mod/extend',
  'mod/screen'
], function($, easing, extend, Screen) {
  var _instance = null;
  var defaults = {
    duration: 1000,
    easing: 'easeInOutExpo',
    fix: 0
  };
  function Anchor() {
    this.conf = {};
    if (_instance != null) {
      return _instance;
    } else {
      if (!(this instanceof Anchor)) {
        return new Anchor();
      } else {
        _instance = this;
      }
    }
  }
  extend(Anchor.prototype, {
    initialize: function(options) {
      $.extend(this.conf, defaults, options || {});
      this.$a = $('a[href*=#]');
      this.$a.off('click.navAnchor')
        .on('click.navAnchor', $.proxy(this._onClick, this));
    },
    _onClick: function(e) {
      var el = e.currentTarget;
      var $target = this._getTarget(el.hash);
      var pathIsSame = this._pathIsSame(el.pathname);
      var hostIsSame = this._hostIsSame(el.hostname);

      if (el.hash.match(/^#\W/)) {
        return;//exclude routing /#!/ /#/ and so.
      }
      if ($target && pathIsSame && hostIsSame) {
        this._doAnimation($target);
        return false;
      }
    },
    _doAnimation: function($el) {
      var targetOffset, scrollHeight, clientHeight;

      targetOffset = $el.offset().top - this.conf.fix;
      targetOffset = targetOffset < 0 ? 0 : targetOffset;
      scrollHeight = Screen().scrollHeight();
      clientHeight = Screen().clientHeight();
      //console.log((targetOffset + clientHeight) +','+ scrollHeight);
      if ((targetOffset + clientHeight) > scrollHeight) {
        targetOffset = scrollHeight - clientHeight;
      }
      $('html,body').animate({
        scrollTop: targetOffset
      }, this.conf.duration, this.conf.easing).promise().done(
        $.proxy(this._onAnimationComplete, this, {$el: $el})
      );
    },
    _onAnimationComplete: function(data) {
      $(window).trigger('anchorAnimationFinish', {$el: data.$el});
    },
    _getTarget: function(hash) {
      var $target = $(hash);
      return $target.length > 0 && $target || $('[name=' + hash.slice(1) +']');
    },
    _pathIsSame: function(path) {
      return location.pathname.slice(1) === path.slice(1);
    },
    _hostIsSame: function(host) {
      return location.hostname === host;
    }
  });

  return Anchor;
});
/*
*
*   Utils.legacyIE
*
*/

define('mod/utils/legacyie',[], function() {
  return (function() { 
    var undef, v = 3, div = document.createElement('div');
    while (
      div.innerHTML = '<!--[if gt IE '+(++v)+']><i></i><![endif]-->',
      div.getElementsByTagName('i')[0]
    );
    return v > 4 ? v : undef;
  }());
});

/*
*
*   Utils.Browser r2
*
*   @author Yuji Ito @110chang
*
*/

define('mod/browser',[
  'mod/extend',
  'mod/utils/legacyie'
], function(extend, _ie) {
  var _userAgent = navigator.userAgent;
  function _is_IE(ua) {
    return /MSIE/.test(ua);
  }
  function _is_IE11(ua) {
    return /Trident/.test(ua);
  }
  function _is_iPhone(ua) {
    return /iPhone/.test(ua);
  }
  function _is_iPad(ua) {
    return /iPad/.test(ua);
  }
  function _is_Android(ua) {
    return /Android/.test(ua);
  }
  function _is_mobile(ua) {
    return /Mobile/.test(ua); // Android only
  }
  function _is_WebKit(ua) {
    return /WebKit/.test(ua);
  }
  function _is_windows(platform) {
    return /Win/.test(platform);
  }
  function _is_mac(platform) {
    return /Mac/.test(platform);
  }

  function Browser(_userAgent, _platform) {
    if (!(this instanceof Browser)) {
      return new Browser(_userAgent, _platform);
    }
    /* user agent strings for testing */
    this.userAgent = _userAgent || navigator.userAgent;
    this.platform = _platform || navigator.platform;
    this.ua = this.userAgent;
  }
  extend(Browser.prototype, {
    ie: _ie,
    IE: function() {
      return _is_IE(this.ua);
    },
    IE11: function() {
      return _is_IE11(this.ua);
    },
    iPhone: function() {
      return _is_iPhone(this.ua);
    },
    iPad: function() {
      return _is_iPad(this.ua);
    },
    Android: function() {
      return _is_Android(this.ua);
    },
    WebKit: function() {
      return _is_WebKit(this.ua);
    },
    mobile: function() {
      // Android only
      return _is_mobile(this.ua) && _is_Android(this.ua);
    },
    smallScreen: function() {
      return this.iPhone() || this.mobile();
    },
    tablet: function() {
      return this.iPad() || (!_is_mobile(this.ua) && _is_Android(this.ua));
    },
    Windows: function() {
      return _is_windows(this.platform);
    },
    Mac: function() {
      return _is_mac(this.platform);
    }
  });
  
  return Browser;
});

/*
*
*   Utils.requestAnimationFrame r2
*
*   @author Yuji Ito @110chang
*
*/

define('mod/utils/raf',[], function() {
	var requestAnimationFrame;
	var cancelAnimationFrame;

	requestAnimationFrame = window.requestAnimationFrame || 
	window.webkitRequestAnimationFrame  || 
	window.mozRequestAnimationFrame     || 
	window.oRequestAnimationFrame       || 
	window.msRequestAnimationFrame      || 
	function(callback) {
		window.setTimeout(callback, 1000 / 60);
	};
	
	cancelAnimationFrame = window.cancelAnimationFrame ||
	window.mozCancelAnimationFrame ||
	window.webkitCancelAnimationFrame ||
	window.msCancelAnimationFrame ||
	function(id) {
		window.clearTimeout(id);
		id = null;
	};
	
	if (!window.requestAnimationFrame) {
		window.requestAnimationFrame = requestAnimationFrame;
	}
	if (!window.cancelAnimationFrame) {
		window.cancelAnimationFrame = cancelAnimationFrame;
	}

	return requestAnimationFrame;
});

var Box2D={};
(function(F,G){function K(){}if(!(Object.prototype.defineProperty instanceof Function)&&Object.prototype.__defineGetter__ instanceof Function&&Object.prototype.__defineSetter__ instanceof Function)Object.defineProperty=function(y,w,A){A.get instanceof Function&&y.__defineGetter__(w,A.get);A.set instanceof Function&&y.__defineSetter__(w,A.set)};F.inherit=function(y,w){K.prototype=w.prototype;y.prototype=new K;y.prototype.constructor=y};F.generateCallback=function(y,w){return function(){w.apply(y,arguments)}};
F.NVector=function(y){if(y===G)y=0;for(var w=Array(y||0),A=0;A<y;++A)w[A]=0;return w};F.is=function(y,w){if(y===null)return false;if(w instanceof Function&&y instanceof w)return true;if(y.constructor.__implements!=G&&y.constructor.__implements[w])return true;return false};F.parseUInt=function(y){return Math.abs(parseInt(y))}})(Box2D);var Vector=Array,Vector_a2j_Number=Box2D.NVector;if(typeof Box2D==="undefined")Box2D={};if(typeof Box2D.Collision==="undefined")Box2D.Collision={};
if(typeof Box2D.Collision.Shapes==="undefined")Box2D.Collision.Shapes={};if(typeof Box2D.Common==="undefined")Box2D.Common={};if(typeof Box2D.Common.Math==="undefined")Box2D.Common.Math={};if(typeof Box2D.Dynamics==="undefined")Box2D.Dynamics={};if(typeof Box2D.Dynamics.Contacts==="undefined")Box2D.Dynamics.Contacts={};if(typeof Box2D.Dynamics.Controllers==="undefined")Box2D.Dynamics.Controllers={};if(typeof Box2D.Dynamics.Joints==="undefined")Box2D.Dynamics.Joints={};
(function(){function F(){F.b2AABB.apply(this,arguments)}function G(){G.b2Bound.apply(this,arguments)}function K(){K.b2BoundValues.apply(this,arguments);this.constructor===K&&this.b2BoundValues.apply(this,arguments)}function y(){y.b2Collision.apply(this,arguments)}function w(){w.b2ContactID.apply(this,arguments);this.constructor===w&&this.b2ContactID.apply(this,arguments)}function A(){A.b2ContactPoint.apply(this,arguments)}function U(){U.b2Distance.apply(this,arguments)}function p(){p.b2DistanceInput.apply(this,
arguments)}function B(){B.b2DistanceOutput.apply(this,arguments)}function Q(){Q.b2DistanceProxy.apply(this,arguments)}function V(){V.b2DynamicTree.apply(this,arguments);this.constructor===V&&this.b2DynamicTree.apply(this,arguments)}function M(){M.b2DynamicTreeBroadPhase.apply(this,arguments)}function L(){L.b2DynamicTreeNode.apply(this,arguments)}function I(){I.b2DynamicTreePair.apply(this,arguments)}function W(){W.b2Manifold.apply(this,arguments);this.constructor===W&&this.b2Manifold.apply(this,arguments)}
function Y(){Y.b2ManifoldPoint.apply(this,arguments);this.constructor===Y&&this.b2ManifoldPoint.apply(this,arguments)}function k(){k.b2Point.apply(this,arguments)}function z(){z.b2RayCastInput.apply(this,arguments);this.constructor===z&&this.b2RayCastInput.apply(this,arguments)}function u(){u.b2RayCastOutput.apply(this,arguments)}function D(){D.b2Segment.apply(this,arguments)}function H(){H.b2SeparationFunction.apply(this,arguments)}function O(){O.b2Simplex.apply(this,arguments);this.constructor===
O&&this.b2Simplex.apply(this,arguments)}function E(){E.b2SimplexCache.apply(this,arguments)}function R(){R.b2SimplexVertex.apply(this,arguments)}function N(){N.b2TimeOfImpact.apply(this,arguments)}function S(){S.b2TOIInput.apply(this,arguments)}function aa(){aa.b2WorldManifold.apply(this,arguments);this.constructor===aa&&this.b2WorldManifold.apply(this,arguments)}function Z(){Z.ClipVertex.apply(this,arguments)}function d(){d.Features.apply(this,arguments)}function h(){h.b2CircleShape.apply(this,arguments);
this.constructor===h&&this.b2CircleShape.apply(this,arguments)}function l(){l.b2EdgeChainDef.apply(this,arguments);this.constructor===l&&this.b2EdgeChainDef.apply(this,arguments)}function j(){j.b2EdgeShape.apply(this,arguments);this.constructor===j&&this.b2EdgeShape.apply(this,arguments)}function o(){o.b2MassData.apply(this,arguments)}function q(){q.b2PolygonShape.apply(this,arguments);this.constructor===q&&this.b2PolygonShape.apply(this,arguments)}function n(){n.b2Shape.apply(this,arguments);this.constructor===
n&&this.b2Shape.apply(this,arguments)}function a(){a.b2Color.apply(this,arguments);this.constructor===a&&this.b2Color.apply(this,arguments)}function c(){c.b2Settings.apply(this,arguments)}function g(){g.b2Mat22.apply(this,arguments);this.constructor===g&&this.b2Mat22.apply(this,arguments)}function b(){b.b2Mat33.apply(this,arguments);this.constructor===b&&this.b2Mat33.apply(this,arguments)}function e(){e.b2Math.apply(this,arguments)}function f(){f.b2Sweep.apply(this,arguments)}function m(){m.b2Transform.apply(this,
arguments);this.constructor===m&&this.b2Transform.apply(this,arguments)}function r(){r.b2Vec2.apply(this,arguments);this.constructor===r&&this.b2Vec2.apply(this,arguments)}function s(){s.b2Vec3.apply(this,arguments);this.constructor===s&&this.b2Vec3.apply(this,arguments)}function v(){v.b2Body.apply(this,arguments);this.constructor===v&&this.b2Body.apply(this,arguments)}function t(){t.b2BodyDef.apply(this,arguments);this.constructor===t&&this.b2BodyDef.apply(this,arguments)}function x(){x.b2ContactFilter.apply(this,
arguments)}function C(){C.b2ContactImpulse.apply(this,arguments)}function J(){J.b2ContactListener.apply(this,arguments)}function T(){T.b2ContactManager.apply(this,arguments);this.constructor===T&&this.b2ContactManager.apply(this,arguments)}function P(){P.b2DebugDraw.apply(this,arguments);this.constructor===P&&this.b2DebugDraw.apply(this,arguments)}function X(){X.b2DestructionListener.apply(this,arguments)}function $(){$.b2FilterData.apply(this,arguments)}function ba(){ba.b2Fixture.apply(this,arguments);
this.constructor===ba&&this.b2Fixture.apply(this,arguments)}function ca(){ca.b2FixtureDef.apply(this,arguments);this.constructor===ca&&this.b2FixtureDef.apply(this,arguments)}function da(){da.b2Island.apply(this,arguments);this.constructor===da&&this.b2Island.apply(this,arguments)}function Fa(){Fa.b2TimeStep.apply(this,arguments)}function ea(){ea.b2World.apply(this,arguments);this.constructor===ea&&this.b2World.apply(this,arguments)}function Ga(){Ga.b2CircleContact.apply(this,arguments)}function fa(){fa.b2Contact.apply(this,
arguments);this.constructor===fa&&this.b2Contact.apply(this,arguments)}function ga(){ga.b2ContactConstraint.apply(this,arguments);this.constructor===ga&&this.b2ContactConstraint.apply(this,arguments)}function Ha(){Ha.b2ContactConstraintPoint.apply(this,arguments)}function Ia(){Ia.b2ContactEdge.apply(this,arguments)}function ha(){ha.b2ContactFactory.apply(this,arguments);this.constructor===ha&&this.b2ContactFactory.apply(this,arguments)}function Ja(){Ja.b2ContactRegister.apply(this,arguments)}function Ka(){Ka.b2ContactResult.apply(this,
arguments)}function ia(){ia.b2ContactSolver.apply(this,arguments);this.constructor===ia&&this.b2ContactSolver.apply(this,arguments)}function La(){La.b2EdgeAndCircleContact.apply(this,arguments)}function ja(){ja.b2NullContact.apply(this,arguments);this.constructor===ja&&this.b2NullContact.apply(this,arguments)}function Ma(){Ma.b2PolyAndCircleContact.apply(this,arguments)}function Na(){Na.b2PolyAndEdgeContact.apply(this,arguments)}function Oa(){Oa.b2PolygonContact.apply(this,arguments)}function ka(){ka.b2PositionSolverManifold.apply(this,
arguments);this.constructor===ka&&this.b2PositionSolverManifold.apply(this,arguments)}function Pa(){Pa.b2BuoyancyController.apply(this,arguments)}function Qa(){Qa.b2ConstantAccelController.apply(this,arguments)}function Ra(){Ra.b2ConstantForceController.apply(this,arguments)}function Sa(){Sa.b2Controller.apply(this,arguments)}function Ta(){Ta.b2ControllerEdge.apply(this,arguments)}function Ua(){Ua.b2GravityController.apply(this,arguments)}function Va(){Va.b2TensorDampingController.apply(this,arguments)}
function la(){la.b2DistanceJoint.apply(this,arguments);this.constructor===la&&this.b2DistanceJoint.apply(this,arguments)}function ma(){ma.b2DistanceJointDef.apply(this,arguments);this.constructor===ma&&this.b2DistanceJointDef.apply(this,arguments)}function na(){na.b2FrictionJoint.apply(this,arguments);this.constructor===na&&this.b2FrictionJoint.apply(this,arguments)}function oa(){oa.b2FrictionJointDef.apply(this,arguments);this.constructor===oa&&this.b2FrictionJointDef.apply(this,arguments)}function pa(){pa.b2GearJoint.apply(this,
arguments);this.constructor===pa&&this.b2GearJoint.apply(this,arguments)}function qa(){qa.b2GearJointDef.apply(this,arguments);this.constructor===qa&&this.b2GearJointDef.apply(this,arguments)}function Wa(){Wa.b2Jacobian.apply(this,arguments)}function ra(){ra.b2Joint.apply(this,arguments);this.constructor===ra&&this.b2Joint.apply(this,arguments)}function sa(){sa.b2JointDef.apply(this,arguments);this.constructor===sa&&this.b2JointDef.apply(this,arguments)}function Xa(){Xa.b2JointEdge.apply(this,arguments)}
function ta(){ta.b2LineJoint.apply(this,arguments);this.constructor===ta&&this.b2LineJoint.apply(this,arguments)}function ua(){ua.b2LineJointDef.apply(this,arguments);this.constructor===ua&&this.b2LineJointDef.apply(this,arguments)}function va(){va.b2MouseJoint.apply(this,arguments);this.constructor===va&&this.b2MouseJoint.apply(this,arguments)}function wa(){wa.b2MouseJointDef.apply(this,arguments);this.constructor===wa&&this.b2MouseJointDef.apply(this,arguments)}function xa(){xa.b2PrismaticJoint.apply(this,
arguments);this.constructor===xa&&this.b2PrismaticJoint.apply(this,arguments)}function ya(){ya.b2PrismaticJointDef.apply(this,arguments);this.constructor===ya&&this.b2PrismaticJointDef.apply(this,arguments)}function za(){za.b2PulleyJoint.apply(this,arguments);this.constructor===za&&this.b2PulleyJoint.apply(this,arguments)}function Aa(){Aa.b2PulleyJointDef.apply(this,arguments);this.constructor===Aa&&this.b2PulleyJointDef.apply(this,arguments)}function Ba(){Ba.b2RevoluteJoint.apply(this,arguments);
this.constructor===Ba&&this.b2RevoluteJoint.apply(this,arguments)}function Ca(){Ca.b2RevoluteJointDef.apply(this,arguments);this.constructor===Ca&&this.b2RevoluteJointDef.apply(this,arguments)}function Da(){Da.b2WeldJoint.apply(this,arguments);this.constructor===Da&&this.b2WeldJoint.apply(this,arguments)}function Ea(){Ea.b2WeldJointDef.apply(this,arguments);this.constructor===Ea&&this.b2WeldJointDef.apply(this,arguments)}Box2D.Collision.IBroadPhase="Box2D.Collision.IBroadPhase";Box2D.Collision.b2AABB=
F;Box2D.Collision.b2Bound=G;Box2D.Collision.b2BoundValues=K;Box2D.Collision.b2Collision=y;Box2D.Collision.b2ContactID=w;Box2D.Collision.b2ContactPoint=A;Box2D.Collision.b2Distance=U;Box2D.Collision.b2DistanceInput=p;Box2D.Collision.b2DistanceOutput=B;Box2D.Collision.b2DistanceProxy=Q;Box2D.Collision.b2DynamicTree=V;Box2D.Collision.b2DynamicTreeBroadPhase=M;Box2D.Collision.b2DynamicTreeNode=L;Box2D.Collision.b2DynamicTreePair=I;Box2D.Collision.b2Manifold=W;Box2D.Collision.b2ManifoldPoint=Y;Box2D.Collision.b2Point=
k;Box2D.Collision.b2RayCastInput=z;Box2D.Collision.b2RayCastOutput=u;Box2D.Collision.b2Segment=D;Box2D.Collision.b2SeparationFunction=H;Box2D.Collision.b2Simplex=O;Box2D.Collision.b2SimplexCache=E;Box2D.Collision.b2SimplexVertex=R;Box2D.Collision.b2TimeOfImpact=N;Box2D.Collision.b2TOIInput=S;Box2D.Collision.b2WorldManifold=aa;Box2D.Collision.ClipVertex=Z;Box2D.Collision.Features=d;Box2D.Collision.Shapes.b2CircleShape=h;Box2D.Collision.Shapes.b2EdgeChainDef=l;Box2D.Collision.Shapes.b2EdgeShape=j;Box2D.Collision.Shapes.b2MassData=
o;Box2D.Collision.Shapes.b2PolygonShape=q;Box2D.Collision.Shapes.b2Shape=n;Box2D.Common.b2internal="Box2D.Common.b2internal";Box2D.Common.b2Color=a;Box2D.Common.b2Settings=c;Box2D.Common.Math.b2Mat22=g;Box2D.Common.Math.b2Mat33=b;Box2D.Common.Math.b2Math=e;Box2D.Common.Math.b2Sweep=f;Box2D.Common.Math.b2Transform=m;Box2D.Common.Math.b2Vec2=r;Box2D.Common.Math.b2Vec3=s;Box2D.Dynamics.b2Body=v;Box2D.Dynamics.b2BodyDef=t;Box2D.Dynamics.b2ContactFilter=x;Box2D.Dynamics.b2ContactImpulse=C;Box2D.Dynamics.b2ContactListener=
J;Box2D.Dynamics.b2ContactManager=T;Box2D.Dynamics.b2DebugDraw=P;Box2D.Dynamics.b2DestructionListener=X;Box2D.Dynamics.b2FilterData=$;Box2D.Dynamics.b2Fixture=ba;Box2D.Dynamics.b2FixtureDef=ca;Box2D.Dynamics.b2Island=da;Box2D.Dynamics.b2TimeStep=Fa;Box2D.Dynamics.b2World=ea;Box2D.Dynamics.Contacts.b2CircleContact=Ga;Box2D.Dynamics.Contacts.b2Contact=fa;Box2D.Dynamics.Contacts.b2ContactConstraint=ga;Box2D.Dynamics.Contacts.b2ContactConstraintPoint=Ha;Box2D.Dynamics.Contacts.b2ContactEdge=Ia;Box2D.Dynamics.Contacts.b2ContactFactory=
ha;Box2D.Dynamics.Contacts.b2ContactRegister=Ja;Box2D.Dynamics.Contacts.b2ContactResult=Ka;Box2D.Dynamics.Contacts.b2ContactSolver=ia;Box2D.Dynamics.Contacts.b2EdgeAndCircleContact=La;Box2D.Dynamics.Contacts.b2NullContact=ja;Box2D.Dynamics.Contacts.b2PolyAndCircleContact=Ma;Box2D.Dynamics.Contacts.b2PolyAndEdgeContact=Na;Box2D.Dynamics.Contacts.b2PolygonContact=Oa;Box2D.Dynamics.Contacts.b2PositionSolverManifold=ka;Box2D.Dynamics.Controllers.b2BuoyancyController=Pa;Box2D.Dynamics.Controllers.b2ConstantAccelController=
Qa;Box2D.Dynamics.Controllers.b2ConstantForceController=Ra;Box2D.Dynamics.Controllers.b2Controller=Sa;Box2D.Dynamics.Controllers.b2ControllerEdge=Ta;Box2D.Dynamics.Controllers.b2GravityController=Ua;Box2D.Dynamics.Controllers.b2TensorDampingController=Va;Box2D.Dynamics.Joints.b2DistanceJoint=la;Box2D.Dynamics.Joints.b2DistanceJointDef=ma;Box2D.Dynamics.Joints.b2FrictionJoint=na;Box2D.Dynamics.Joints.b2FrictionJointDef=oa;Box2D.Dynamics.Joints.b2GearJoint=pa;Box2D.Dynamics.Joints.b2GearJointDef=qa;
Box2D.Dynamics.Joints.b2Jacobian=Wa;Box2D.Dynamics.Joints.b2Joint=ra;Box2D.Dynamics.Joints.b2JointDef=sa;Box2D.Dynamics.Joints.b2JointEdge=Xa;Box2D.Dynamics.Joints.b2LineJoint=ta;Box2D.Dynamics.Joints.b2LineJointDef=ua;Box2D.Dynamics.Joints.b2MouseJoint=va;Box2D.Dynamics.Joints.b2MouseJointDef=wa;Box2D.Dynamics.Joints.b2PrismaticJoint=xa;Box2D.Dynamics.Joints.b2PrismaticJointDef=ya;Box2D.Dynamics.Joints.b2PulleyJoint=za;Box2D.Dynamics.Joints.b2PulleyJointDef=Aa;Box2D.Dynamics.Joints.b2RevoluteJoint=
Ba;Box2D.Dynamics.Joints.b2RevoluteJointDef=Ca;Box2D.Dynamics.Joints.b2WeldJoint=Da;Box2D.Dynamics.Joints.b2WeldJointDef=Ea})();Box2D.postDefs=[];
(function(){var F=Box2D.Collision.Shapes.b2CircleShape,G=Box2D.Collision.Shapes.b2PolygonShape,K=Box2D.Collision.Shapes.b2Shape,y=Box2D.Common.b2Settings,w=Box2D.Common.Math.b2Math,A=Box2D.Common.Math.b2Sweep,U=Box2D.Common.Math.b2Transform,p=Box2D.Common.Math.b2Vec2,B=Box2D.Collision.b2AABB,Q=Box2D.Collision.b2Bound,V=Box2D.Collision.b2BoundValues,M=Box2D.Collision.b2Collision,L=Box2D.Collision.b2ContactID,I=Box2D.Collision.b2ContactPoint,W=Box2D.Collision.b2Distance,Y=Box2D.Collision.b2DistanceInput,
k=Box2D.Collision.b2DistanceOutput,z=Box2D.Collision.b2DistanceProxy,u=Box2D.Collision.b2DynamicTree,D=Box2D.Collision.b2DynamicTreeBroadPhase,H=Box2D.Collision.b2DynamicTreeNode,O=Box2D.Collision.b2DynamicTreePair,E=Box2D.Collision.b2Manifold,R=Box2D.Collision.b2ManifoldPoint,N=Box2D.Collision.b2Point,S=Box2D.Collision.b2RayCastInput,aa=Box2D.Collision.b2RayCastOutput,Z=Box2D.Collision.b2Segment,d=Box2D.Collision.b2SeparationFunction,h=Box2D.Collision.b2Simplex,l=Box2D.Collision.b2SimplexCache,j=
Box2D.Collision.b2SimplexVertex,o=Box2D.Collision.b2TimeOfImpact,q=Box2D.Collision.b2TOIInput,n=Box2D.Collision.b2WorldManifold,a=Box2D.Collision.ClipVertex,c=Box2D.Collision.Features,g=Box2D.Collision.IBroadPhase;B.b2AABB=function(){this.lowerBound=new p;this.upperBound=new p};B.prototype.IsValid=function(){var b=this.upperBound.y-this.lowerBound.y;return b=(b=this.upperBound.x-this.lowerBound.x>=0&&b>=0)&&this.lowerBound.IsValid()&&this.upperBound.IsValid()};B.prototype.GetCenter=function(){return new p((this.lowerBound.x+
this.upperBound.x)/2,(this.lowerBound.y+this.upperBound.y)/2)};B.prototype.GetExtents=function(){return new p((this.upperBound.x-this.lowerBound.x)/2,(this.upperBound.y-this.lowerBound.y)/2)};B.prototype.Contains=function(b){var e=true;return e=(e=(e=(e=e&&this.lowerBound.x<=b.lowerBound.x)&&this.lowerBound.y<=b.lowerBound.y)&&b.upperBound.x<=this.upperBound.x)&&b.upperBound.y<=this.upperBound.y};B.prototype.RayCast=function(b,e){var f=-Number.MAX_VALUE,m=Number.MAX_VALUE,r=e.p1.x,s=e.p1.y,v=e.p2.x-
e.p1.x,t=e.p2.y-e.p1.y,x=Math.abs(t),C=b.normal,J=0,T=0,P=J=0;P=0;if(Math.abs(v)<Number.MIN_VALUE){if(r<this.lowerBound.x||this.upperBound.x<r)return false}else{J=1/v;T=(this.lowerBound.x-r)*J;J=(this.upperBound.x-r)*J;P=-1;if(T>J){P=T;T=J;J=P;P=1}if(T>f){C.x=P;C.y=0;f=T}m=Math.min(m,J);if(f>m)return false}if(x<Number.MIN_VALUE){if(s<this.lowerBound.y||this.upperBound.y<s)return false}else{J=1/t;T=(this.lowerBound.y-s)*J;J=(this.upperBound.y-s)*J;P=-1;if(T>J){P=T;T=J;J=P;P=1}if(T>f){C.y=P;C.x=0;f=
T}m=Math.min(m,J);if(f>m)return false}b.fraction=f;return true};B.prototype.TestOverlap=function(b){var e=b.lowerBound.y-this.upperBound.y,f=this.lowerBound.y-b.upperBound.y;if(b.lowerBound.x-this.upperBound.x>0||e>0)return false;if(this.lowerBound.x-b.upperBound.x>0||f>0)return false;return true};B.Combine=function(b,e){var f=new B;f.Combine(b,e);return f};B.prototype.Combine=function(b,e){this.lowerBound.x=Math.min(b.lowerBound.x,e.lowerBound.x);this.lowerBound.y=Math.min(b.lowerBound.y,e.lowerBound.y);
this.upperBound.x=Math.max(b.upperBound.x,e.upperBound.x);this.upperBound.y=Math.max(b.upperBound.y,e.upperBound.y)};Q.b2Bound=function(){};Q.prototype.IsLower=function(){return(this.value&1)==0};Q.prototype.IsUpper=function(){return(this.value&1)==1};Q.prototype.Swap=function(b){var e=this.value,f=this.proxy,m=this.stabbingCount;this.value=b.value;this.proxy=b.proxy;this.stabbingCount=b.stabbingCount;b.value=e;b.proxy=f;b.stabbingCount=m};V.b2BoundValues=function(){};V.prototype.b2BoundValues=function(){this.lowerValues=
new Vector_a2j_Number;this.lowerValues[0]=0;this.lowerValues[1]=0;this.upperValues=new Vector_a2j_Number;this.upperValues[0]=0;this.upperValues[1]=0};M.b2Collision=function(){};M.ClipSegmentToLine=function(b,e,f,m){if(m===undefined)m=0;var r,s=0;r=e[0];var v=r.v;r=e[1];var t=r.v,x=f.x*v.x+f.y*v.y-m;r=f.x*t.x+f.y*t.y-m;x<=0&&b[s++].Set(e[0]);r<=0&&b[s++].Set(e[1]);if(x*r<0){f=x/(x-r);r=b[s];r=r.v;r.x=v.x+f*(t.x-v.x);r.y=v.y+f*(t.y-v.y);r=b[s];r.id=(x>0?e[0]:e[1]).id;++s}return s};M.EdgeSeparation=
function(b,e,f,m,r){if(f===undefined)f=0;parseInt(b.m_vertexCount);var s=b.m_vertices;b=b.m_normals;var v=parseInt(m.m_vertexCount),t=m.m_vertices,x,C;x=e.R;C=b[f];b=x.col1.x*C.x+x.col2.x*C.y;m=x.col1.y*C.x+x.col2.y*C.y;x=r.R;var J=x.col1.x*b+x.col1.y*m;x=x.col2.x*b+x.col2.y*m;for(var T=0,P=Number.MAX_VALUE,X=0;X<v;++X){C=t[X];C=C.x*J+C.y*x;if(C<P){P=C;T=X}}C=s[f];x=e.R;f=e.position.x+(x.col1.x*C.x+x.col2.x*C.y);e=e.position.y+(x.col1.y*C.x+x.col2.y*C.y);C=t[T];x=r.R;s=r.position.x+(x.col1.x*C.x+
x.col2.x*C.y);r=r.position.y+(x.col1.y*C.x+x.col2.y*C.y);s-=f;r-=e;return s*b+r*m};M.FindMaxSeparation=function(b,e,f,m,r){var s=parseInt(e.m_vertexCount),v=e.m_normals,t,x;x=r.R;t=m.m_centroid;var C=r.position.x+(x.col1.x*t.x+x.col2.x*t.y),J=r.position.y+(x.col1.y*t.x+x.col2.y*t.y);x=f.R;t=e.m_centroid;C-=f.position.x+(x.col1.x*t.x+x.col2.x*t.y);J-=f.position.y+(x.col1.y*t.x+x.col2.y*t.y);x=C*f.R.col1.x+J*f.R.col1.y;J=C*f.R.col2.x+J*f.R.col2.y;C=0;for(var T=-Number.MAX_VALUE,P=0;P<s;++P){t=v[P];
t=t.x*x+t.y*J;if(t>T){T=t;C=P}}v=M.EdgeSeparation(e,f,C,m,r);t=parseInt(C-1>=0?C-1:s-1);x=M.EdgeSeparation(e,f,t,m,r);J=parseInt(C+1<s?C+1:0);T=M.EdgeSeparation(e,f,J,m,r);var X=P=0,$=0;if(x>v&&x>T){$=-1;P=t;X=x}else if(T>v){$=1;P=J;X=T}else{b[0]=C;return v}for(;;){C=$==-1?P-1>=0?P-1:s-1:P+1<s?P+1:0;v=M.EdgeSeparation(e,f,C,m,r);if(v>X){P=C;X=v}else break}b[0]=P;return X};M.FindIncidentEdge=function(b,e,f,m,r,s){if(m===undefined)m=0;parseInt(e.m_vertexCount);var v=e.m_normals,t=parseInt(r.m_vertexCount);
e=r.m_vertices;r=r.m_normals;var x;x=f.R;f=v[m];v=x.col1.x*f.x+x.col2.x*f.y;var C=x.col1.y*f.x+x.col2.y*f.y;x=s.R;f=x.col1.x*v+x.col1.y*C;C=x.col2.x*v+x.col2.y*C;v=f;x=0;for(var J=Number.MAX_VALUE,T=0;T<t;++T){f=r[T];f=v*f.x+C*f.y;if(f<J){J=f;x=T}}r=parseInt(x);v=parseInt(r+1<t?r+1:0);t=b[0];f=e[r];x=s.R;t.v.x=s.position.x+(x.col1.x*f.x+x.col2.x*f.y);t.v.y=s.position.y+(x.col1.y*f.x+x.col2.y*f.y);t.id.features.referenceEdge=m;t.id.features.incidentEdge=r;t.id.features.incidentVertex=0;t=b[1];f=e[v];
x=s.R;t.v.x=s.position.x+(x.col1.x*f.x+x.col2.x*f.y);t.v.y=s.position.y+(x.col1.y*f.x+x.col2.y*f.y);t.id.features.referenceEdge=m;t.id.features.incidentEdge=v;t.id.features.incidentVertex=1};M.MakeClipPointVector=function(){var b=new Vector(2);b[0]=new a;b[1]=new a;return b};M.CollidePolygons=function(b,e,f,m,r){var s;b.m_pointCount=0;var v=e.m_radius+m.m_radius;s=0;M.s_edgeAO[0]=s;var t=M.FindMaxSeparation(M.s_edgeAO,e,f,m,r);s=M.s_edgeAO[0];if(!(t>v)){var x=0;M.s_edgeBO[0]=x;var C=M.FindMaxSeparation(M.s_edgeBO,
m,r,e,f);x=M.s_edgeBO[0];if(!(C>v)){var J=0,T=0;if(C>0.98*t+0.0010){t=m;m=e;e=r;f=f;J=x;b.m_type=E.e_faceB;T=1}else{t=e;m=m;e=f;f=r;J=s;b.m_type=E.e_faceA;T=0}s=M.s_incidentEdge;M.FindIncidentEdge(s,t,e,J,m,f);x=parseInt(t.m_vertexCount);r=t.m_vertices;t=r[J];var P;P=J+1<x?r[parseInt(J+1)]:r[0];J=M.s_localTangent;J.Set(P.x-t.x,P.y-t.y);J.Normalize();r=M.s_localNormal;r.x=J.y;r.y=-J.x;m=M.s_planePoint;m.Set(0.5*(t.x+P.x),0.5*(t.y+P.y));C=M.s_tangent;x=e.R;C.x=x.col1.x*J.x+x.col2.x*J.y;C.y=x.col1.y*
J.x+x.col2.y*J.y;var X=M.s_tangent2;X.x=-C.x;X.y=-C.y;J=M.s_normal;J.x=C.y;J.y=-C.x;var $=M.s_v11,ba=M.s_v12;$.x=e.position.x+(x.col1.x*t.x+x.col2.x*t.y);$.y=e.position.y+(x.col1.y*t.x+x.col2.y*t.y);ba.x=e.position.x+(x.col1.x*P.x+x.col2.x*P.y);ba.y=e.position.y+(x.col1.y*P.x+x.col2.y*P.y);e=J.x*$.x+J.y*$.y;x=C.x*ba.x+C.y*ba.y+v;P=M.s_clipPoints1;t=M.s_clipPoints2;ba=0;ba=M.ClipSegmentToLine(P,s,X,-C.x*$.x-C.y*$.y+v);if(!(ba<2)){ba=M.ClipSegmentToLine(t,P,C,x);if(!(ba<2)){b.m_localPlaneNormal.SetV(r);
b.m_localPoint.SetV(m);for(m=r=0;m<y.b2_maxManifoldPoints;++m){s=t[m];if(J.x*s.v.x+J.y*s.v.y-e<=v){C=b.m_points[r];x=f.R;X=s.v.x-f.position.x;$=s.v.y-f.position.y;C.m_localPoint.x=X*x.col1.x+$*x.col1.y;C.m_localPoint.y=X*x.col2.x+$*x.col2.y;C.m_id.Set(s.id);C.m_id.features.flip=T;++r}}b.m_pointCount=r}}}}};M.CollideCircles=function(b,e,f,m,r){b.m_pointCount=0;var s,v;s=f.R;v=e.m_p;var t=f.position.x+(s.col1.x*v.x+s.col2.x*v.y);f=f.position.y+(s.col1.y*v.x+s.col2.y*v.y);s=r.R;v=m.m_p;t=r.position.x+
(s.col1.x*v.x+s.col2.x*v.y)-t;r=r.position.y+(s.col1.y*v.x+s.col2.y*v.y)-f;s=e.m_radius+m.m_radius;if(!(t*t+r*r>s*s)){b.m_type=E.e_circles;b.m_localPoint.SetV(e.m_p);b.m_localPlaneNormal.SetZero();b.m_pointCount=1;b.m_points[0].m_localPoint.SetV(m.m_p);b.m_points[0].m_id.key=0}};M.CollidePolygonAndCircle=function(b,e,f,m,r){var s=b.m_pointCount=0,v=0,t,x;x=r.R;t=m.m_p;var C=r.position.y+(x.col1.y*t.x+x.col2.y*t.y);s=r.position.x+(x.col1.x*t.x+x.col2.x*t.y)-f.position.x;v=C-f.position.y;x=f.R;f=s*
x.col1.x+v*x.col1.y;x=s*x.col2.x+v*x.col2.y;var J=0;C=-Number.MAX_VALUE;r=e.m_radius+m.m_radius;var T=parseInt(e.m_vertexCount),P=e.m_vertices;e=e.m_normals;for(var X=0;X<T;++X){t=P[X];s=f-t.x;v=x-t.y;t=e[X];s=t.x*s+t.y*v;if(s>r)return;if(s>C){C=s;J=X}}s=parseInt(J);v=parseInt(s+1<T?s+1:0);t=P[s];P=P[v];if(C<Number.MIN_VALUE){b.m_pointCount=1;b.m_type=E.e_faceA;b.m_localPlaneNormal.SetV(e[J]);b.m_localPoint.x=0.5*(t.x+P.x);b.m_localPoint.y=0.5*(t.y+P.y)}else{C=(f-P.x)*(t.x-P.x)+(x-P.y)*(t.y-P.y);
if((f-t.x)*(P.x-t.x)+(x-t.y)*(P.y-t.y)<=0){if((f-t.x)*(f-t.x)+(x-t.y)*(x-t.y)>r*r)return;b.m_pointCount=1;b.m_type=E.e_faceA;b.m_localPlaneNormal.x=f-t.x;b.m_localPlaneNormal.y=x-t.y;b.m_localPlaneNormal.Normalize();b.m_localPoint.SetV(t)}else if(C<=0){if((f-P.x)*(f-P.x)+(x-P.y)*(x-P.y)>r*r)return;b.m_pointCount=1;b.m_type=E.e_faceA;b.m_localPlaneNormal.x=f-P.x;b.m_localPlaneNormal.y=x-P.y;b.m_localPlaneNormal.Normalize();b.m_localPoint.SetV(P)}else{J=0.5*(t.x+P.x);t=0.5*(t.y+P.y);C=(f-J)*e[s].x+
(x-t)*e[s].y;if(C>r)return;b.m_pointCount=1;b.m_type=E.e_faceA;b.m_localPlaneNormal.x=e[s].x;b.m_localPlaneNormal.y=e[s].y;b.m_localPlaneNormal.Normalize();b.m_localPoint.Set(J,t)}}b.m_points[0].m_localPoint.SetV(m.m_p);b.m_points[0].m_id.key=0};M.TestOverlap=function(b,e){var f=e.lowerBound,m=b.upperBound,r=f.x-m.x,s=f.y-m.y;f=b.lowerBound;m=e.upperBound;var v=f.y-m.y;if(r>0||s>0)return false;if(f.x-m.x>0||v>0)return false;return true};Box2D.postDefs.push(function(){Box2D.Collision.b2Collision.s_incidentEdge=
M.MakeClipPointVector();Box2D.Collision.b2Collision.s_clipPoints1=M.MakeClipPointVector();Box2D.Collision.b2Collision.s_clipPoints2=M.MakeClipPointVector();Box2D.Collision.b2Collision.s_edgeAO=new Vector_a2j_Number(1);Box2D.Collision.b2Collision.s_edgeBO=new Vector_a2j_Number(1);Box2D.Collision.b2Collision.s_localTangent=new p;Box2D.Collision.b2Collision.s_localNormal=new p;Box2D.Collision.b2Collision.s_planePoint=new p;Box2D.Collision.b2Collision.s_normal=new p;Box2D.Collision.b2Collision.s_tangent=
new p;Box2D.Collision.b2Collision.s_tangent2=new p;Box2D.Collision.b2Collision.s_v11=new p;Box2D.Collision.b2Collision.s_v12=new p;Box2D.Collision.b2Collision.b2CollidePolyTempVec=new p;Box2D.Collision.b2Collision.b2_nullFeature=255});L.b2ContactID=function(){this.features=new c};L.prototype.b2ContactID=function(){this.features._m_id=this};L.prototype.Set=function(b){this.key=b._key};L.prototype.Copy=function(){var b=new L;b.key=this.key;return b};Object.defineProperty(L.prototype,"key",{enumerable:false,
configurable:true,get:function(){return this._key}});Object.defineProperty(L.prototype,"key",{enumerable:false,configurable:true,set:function(b){if(b===undefined)b=0;this._key=b;this.features._referenceEdge=this._key&255;this.features._incidentEdge=(this._key&65280)>>8&255;this.features._incidentVertex=(this._key&16711680)>>16&255;this.features._flip=(this._key&4278190080)>>24&255}});I.b2ContactPoint=function(){this.position=new p;this.velocity=new p;this.normal=new p;this.id=new L};W.b2Distance=
function(){};W.Distance=function(b,e,f){++W.b2_gjkCalls;var m=f.proxyA,r=f.proxyB,s=f.transformA,v=f.transformB,t=W.s_simplex;t.ReadCache(e,m,s,r,v);var x=t.m_vertices,C=W.s_saveA,J=W.s_saveB,T=0;t.GetClosestPoint().LengthSquared();for(var P=0,X,$=0;$<20;){T=t.m_count;for(P=0;P<T;P++){C[P]=x[P].indexA;J[P]=x[P].indexB}switch(t.m_count){case 1:break;case 2:t.Solve2();break;case 3:t.Solve3();break;default:y.b2Assert(false)}if(t.m_count==3)break;X=t.GetClosestPoint();X.LengthSquared();P=t.GetSearchDirection();
if(P.LengthSquared()<Number.MIN_VALUE*Number.MIN_VALUE)break;X=x[t.m_count];X.indexA=m.GetSupport(w.MulTMV(s.R,P.GetNegative()));X.wA=w.MulX(s,m.GetVertex(X.indexA));X.indexB=r.GetSupport(w.MulTMV(v.R,P));X.wB=w.MulX(v,r.GetVertex(X.indexB));X.w=w.SubtractVV(X.wB,X.wA);++$;++W.b2_gjkIters;var ba=false;for(P=0;P<T;P++)if(X.indexA==C[P]&&X.indexB==J[P]){ba=true;break}if(ba)break;++t.m_count}W.b2_gjkMaxIters=w.Max(W.b2_gjkMaxIters,$);t.GetWitnessPoints(b.pointA,b.pointB);b.distance=w.SubtractVV(b.pointA,
b.pointB).Length();b.iterations=$;t.WriteCache(e);if(f.useRadii){e=m.m_radius;r=r.m_radius;if(b.distance>e+r&&b.distance>Number.MIN_VALUE){b.distance-=e+r;f=w.SubtractVV(b.pointB,b.pointA);f.Normalize();b.pointA.x+=e*f.x;b.pointA.y+=e*f.y;b.pointB.x-=r*f.x;b.pointB.y-=r*f.y}else{X=new p;X.x=0.5*(b.pointA.x+b.pointB.x);X.y=0.5*(b.pointA.y+b.pointB.y);b.pointA.x=b.pointB.x=X.x;b.pointA.y=b.pointB.y=X.y;b.distance=0}}};Box2D.postDefs.push(function(){Box2D.Collision.b2Distance.s_simplex=new h;Box2D.Collision.b2Distance.s_saveA=
new Vector_a2j_Number(3);Box2D.Collision.b2Distance.s_saveB=new Vector_a2j_Number(3)});Y.b2DistanceInput=function(){};k.b2DistanceOutput=function(){this.pointA=new p;this.pointB=new p};z.b2DistanceProxy=function(){};z.prototype.Set=function(b){switch(b.GetType()){case K.e_circleShape:b=b instanceof F?b:null;this.m_vertices=new Vector(1,true);this.m_vertices[0]=b.m_p;this.m_count=1;this.m_radius=b.m_radius;break;case K.e_polygonShape:b=b instanceof G?b:null;this.m_vertices=b.m_vertices;this.m_count=
b.m_vertexCount;this.m_radius=b.m_radius;break;default:y.b2Assert(false)}};z.prototype.GetSupport=function(b){for(var e=0,f=this.m_vertices[0].x*b.x+this.m_vertices[0].y*b.y,m=1;m<this.m_count;++m){var r=this.m_vertices[m].x*b.x+this.m_vertices[m].y*b.y;if(r>f){e=m;f=r}}return e};z.prototype.GetSupportVertex=function(b){for(var e=0,f=this.m_vertices[0].x*b.x+this.m_vertices[0].y*b.y,m=1;m<this.m_count;++m){var r=this.m_vertices[m].x*b.x+this.m_vertices[m].y*b.y;if(r>f){e=m;f=r}}return this.m_vertices[e]};
z.prototype.GetVertexCount=function(){return this.m_count};z.prototype.GetVertex=function(b){if(b===undefined)b=0;y.b2Assert(0<=b&&b<this.m_count);return this.m_vertices[b]};u.b2DynamicTree=function(){};u.prototype.b2DynamicTree=function(){this.m_freeList=this.m_root=null;this.m_insertionCount=this.m_path=0};u.prototype.CreateProxy=function(b,e){var f=this.AllocateNode(),m=y.b2_aabbExtension,r=y.b2_aabbExtension;f.aabb.lowerBound.x=b.lowerBound.x-m;f.aabb.lowerBound.y=b.lowerBound.y-r;f.aabb.upperBound.x=
b.upperBound.x+m;f.aabb.upperBound.y=b.upperBound.y+r;f.userData=e;this.InsertLeaf(f);return f};u.prototype.DestroyProxy=function(b){this.RemoveLeaf(b);this.FreeNode(b)};u.prototype.MoveProxy=function(b,e,f){y.b2Assert(b.IsLeaf());if(b.aabb.Contains(e))return false;this.RemoveLeaf(b);var m=y.b2_aabbExtension+y.b2_aabbMultiplier*(f.x>0?f.x:-f.x);f=y.b2_aabbExtension+y.b2_aabbMultiplier*(f.y>0?f.y:-f.y);b.aabb.lowerBound.x=e.lowerBound.x-m;b.aabb.lowerBound.y=e.lowerBound.y-f;b.aabb.upperBound.x=e.upperBound.x+
m;b.aabb.upperBound.y=e.upperBound.y+f;this.InsertLeaf(b);return true};u.prototype.Rebalance=function(b){if(b===undefined)b=0;if(this.m_root!=null)for(var e=0;e<b;e++){for(var f=this.m_root,m=0;f.IsLeaf()==false;){f=this.m_path>>m&1?f.child2:f.child1;m=m+1&31}++this.m_path;this.RemoveLeaf(f);this.InsertLeaf(f)}};u.prototype.GetFatAABB=function(b){return b.aabb};u.prototype.GetUserData=function(b){return b.userData};u.prototype.Query=function(b,e){if(this.m_root!=null){var f=new Vector,m=0;for(f[m++]=
this.m_root;m>0;){var r=f[--m];if(r.aabb.TestOverlap(e))if(r.IsLeaf()){if(!b(r))break}else{f[m++]=r.child1;f[m++]=r.child2}}}};u.prototype.RayCast=function(b,e){if(this.m_root!=null){var f=e.p1,m=e.p2,r=w.SubtractVV(f,m);r.Normalize();r=w.CrossFV(1,r);var s=w.AbsV(r),v=e.maxFraction,t=new B,x=0,C=0;x=f.x+v*(m.x-f.x);C=f.y+v*(m.y-f.y);t.lowerBound.x=Math.min(f.x,x);t.lowerBound.y=Math.min(f.y,C);t.upperBound.x=Math.max(f.x,x);t.upperBound.y=Math.max(f.y,C);var J=new Vector,T=0;for(J[T++]=this.m_root;T>
0;){v=J[--T];if(v.aabb.TestOverlap(t)!=false){x=v.aabb.GetCenter();C=v.aabb.GetExtents();if(!(Math.abs(r.x*(f.x-x.x)+r.y*(f.y-x.y))-s.x*C.x-s.y*C.y>0))if(v.IsLeaf()){x=new S;x.p1=e.p1;x.p2=e.p2;x.maxFraction=e.maxFraction;v=b(x,v);if(v==0)break;if(v>0){x=f.x+v*(m.x-f.x);C=f.y+v*(m.y-f.y);t.lowerBound.x=Math.min(f.x,x);t.lowerBound.y=Math.min(f.y,C);t.upperBound.x=Math.max(f.x,x);t.upperBound.y=Math.max(f.y,C)}}else{J[T++]=v.child1;J[T++]=v.child2}}}}};u.prototype.AllocateNode=function(){if(this.m_freeList){var b=
this.m_freeList;this.m_freeList=b.parent;b.parent=null;b.child1=null;b.child2=null;return b}return new H};u.prototype.FreeNode=function(b){b.parent=this.m_freeList;this.m_freeList=b};u.prototype.InsertLeaf=function(b){++this.m_insertionCount;if(this.m_root==null){this.m_root=b;this.m_root.parent=null}else{var e=b.aabb.GetCenter(),f=this.m_root;if(f.IsLeaf()==false){do{var m=f.child1;f=f.child2;f=Math.abs((m.aabb.lowerBound.x+m.aabb.upperBound.x)/2-e.x)+Math.abs((m.aabb.lowerBound.y+m.aabb.upperBound.y)/
2-e.y)<Math.abs((f.aabb.lowerBound.x+f.aabb.upperBound.x)/2-e.x)+Math.abs((f.aabb.lowerBound.y+f.aabb.upperBound.y)/2-e.y)?m:f}while(f.IsLeaf()==false)}e=f.parent;m=this.AllocateNode();m.parent=e;m.userData=null;m.aabb.Combine(b.aabb,f.aabb);if(e){if(f.parent.child1==f)e.child1=m;else e.child2=m;m.child1=f;m.child2=b;f.parent=m;b.parent=m;do{if(e.aabb.Contains(m.aabb))break;e.aabb.Combine(e.child1.aabb,e.child2.aabb);m=e;e=e.parent}while(e)}else{m.child1=f;m.child2=b;f.parent=m;this.m_root=b.parent=
m}}};u.prototype.RemoveLeaf=function(b){if(b==this.m_root)this.m_root=null;else{var e=b.parent,f=e.parent;b=e.child1==b?e.child2:e.child1;if(f){if(f.child1==e)f.child1=b;else f.child2=b;b.parent=f;for(this.FreeNode(e);f;){e=f.aabb;f.aabb=B.Combine(f.child1.aabb,f.child2.aabb);if(e.Contains(f.aabb))break;f=f.parent}}else{this.m_root=b;b.parent=null;this.FreeNode(e)}}};D.b2DynamicTreeBroadPhase=function(){this.m_tree=new u;this.m_moveBuffer=new Vector;this.m_pairBuffer=new Vector;this.m_pairCount=0};
D.prototype.CreateProxy=function(b,e){var f=this.m_tree.CreateProxy(b,e);++this.m_proxyCount;this.BufferMove(f);return f};D.prototype.DestroyProxy=function(b){this.UnBufferMove(b);--this.m_proxyCount;this.m_tree.DestroyProxy(b)};D.prototype.MoveProxy=function(b,e,f){this.m_tree.MoveProxy(b,e,f)&&this.BufferMove(b)};D.prototype.TestOverlap=function(b,e){var f=this.m_tree.GetFatAABB(b),m=this.m_tree.GetFatAABB(e);return f.TestOverlap(m)};D.prototype.GetUserData=function(b){return this.m_tree.GetUserData(b)};
D.prototype.GetFatAABB=function(b){return this.m_tree.GetFatAABB(b)};D.prototype.GetProxyCount=function(){return this.m_proxyCount};D.prototype.UpdatePairs=function(b){var e=this;var f=e.m_pairCount=0,m;for(f=0;f<e.m_moveBuffer.length;++f){m=e.m_moveBuffer[f];var r=e.m_tree.GetFatAABB(m);e.m_tree.Query(function(t){if(t==m)return true;if(e.m_pairCount==e.m_pairBuffer.length)e.m_pairBuffer[e.m_pairCount]=new O;var x=e.m_pairBuffer[e.m_pairCount];x.proxyA=t<m?t:m;x.proxyB=t>=m?t:m;++e.m_pairCount;return true},
r)}for(f=e.m_moveBuffer.length=0;f<e.m_pairCount;){r=e.m_pairBuffer[f];var s=e.m_tree.GetUserData(r.proxyA),v=e.m_tree.GetUserData(r.proxyB);b(s,v);for(++f;f<e.m_pairCount;){s=e.m_pairBuffer[f];if(s.proxyA!=r.proxyA||s.proxyB!=r.proxyB)break;++f}}};D.prototype.Query=function(b,e){this.m_tree.Query(b,e)};D.prototype.RayCast=function(b,e){this.m_tree.RayCast(b,e)};D.prototype.Validate=function(){};D.prototype.Rebalance=function(b){if(b===undefined)b=0;this.m_tree.Rebalance(b)};D.prototype.BufferMove=
function(b){this.m_moveBuffer[this.m_moveBuffer.length]=b};D.prototype.UnBufferMove=function(b){this.m_moveBuffer.splice(parseInt(this.m_moveBuffer.indexOf(b)),1)};D.prototype.ComparePairs=function(){return 0};D.__implements={};D.__implements[g]=true;H.b2DynamicTreeNode=function(){this.aabb=new B};H.prototype.IsLeaf=function(){return this.child1==null};O.b2DynamicTreePair=function(){};E.b2Manifold=function(){this.m_pointCount=0};E.prototype.b2Manifold=function(){this.m_points=new Vector(y.b2_maxManifoldPoints);
for(var b=0;b<y.b2_maxManifoldPoints;b++)this.m_points[b]=new R;this.m_localPlaneNormal=new p;this.m_localPoint=new p};E.prototype.Reset=function(){for(var b=0;b<y.b2_maxManifoldPoints;b++)(this.m_points[b]instanceof R?this.m_points[b]:null).Reset();this.m_localPlaneNormal.SetZero();this.m_localPoint.SetZero();this.m_pointCount=this.m_type=0};E.prototype.Set=function(b){this.m_pointCount=b.m_pointCount;for(var e=0;e<y.b2_maxManifoldPoints;e++)(this.m_points[e]instanceof R?this.m_points[e]:null).Set(b.m_points[e]);
this.m_localPlaneNormal.SetV(b.m_localPlaneNormal);this.m_localPoint.SetV(b.m_localPoint);this.m_type=b.m_type};E.prototype.Copy=function(){var b=new E;b.Set(this);return b};Box2D.postDefs.push(function(){Box2D.Collision.b2Manifold.e_circles=1;Box2D.Collision.b2Manifold.e_faceA=2;Box2D.Collision.b2Manifold.e_faceB=4});R.b2ManifoldPoint=function(){this.m_localPoint=new p;this.m_id=new L};R.prototype.b2ManifoldPoint=function(){this.Reset()};R.prototype.Reset=function(){this.m_localPoint.SetZero();this.m_tangentImpulse=
this.m_normalImpulse=0;this.m_id.key=0};R.prototype.Set=function(b){this.m_localPoint.SetV(b.m_localPoint);this.m_normalImpulse=b.m_normalImpulse;this.m_tangentImpulse=b.m_tangentImpulse;this.m_id.Set(b.m_id)};N.b2Point=function(){this.p=new p};N.prototype.Support=function(){return this.p};N.prototype.GetFirstVertex=function(){return this.p};S.b2RayCastInput=function(){this.p1=new p;this.p2=new p};S.prototype.b2RayCastInput=function(b,e,f){if(b===undefined)b=null;if(e===undefined)e=null;if(f===undefined)f=
1;b&&this.p1.SetV(b);e&&this.p2.SetV(e);this.maxFraction=f};aa.b2RayCastOutput=function(){this.normal=new p};Z.b2Segment=function(){this.p1=new p;this.p2=new p};Z.prototype.TestSegment=function(b,e,f,m){if(m===undefined)m=0;var r=f.p1,s=f.p2.x-r.x,v=f.p2.y-r.y;f=this.p2.y-this.p1.y;var t=-(this.p2.x-this.p1.x),x=100*Number.MIN_VALUE,C=-(s*f+v*t);if(C>x){var J=r.x-this.p1.x,T=r.y-this.p1.y;r=J*f+T*t;if(0<=r&&r<=m*C){m=-s*T+v*J;if(-x*C<=m&&m<=C*(1+x)){r/=C;m=Math.sqrt(f*f+t*t);f/=m;t/=m;b[0]=r;e.Set(f,
t);return true}}}return false};Z.prototype.Extend=function(b){this.ExtendForward(b);this.ExtendBackward(b)};Z.prototype.ExtendForward=function(b){var e=this.p2.x-this.p1.x,f=this.p2.y-this.p1.y;b=Math.min(e>0?(b.upperBound.x-this.p1.x)/e:e<0?(b.lowerBound.x-this.p1.x)/e:Number.POSITIVE_INFINITY,f>0?(b.upperBound.y-this.p1.y)/f:f<0?(b.lowerBound.y-this.p1.y)/f:Number.POSITIVE_INFINITY);this.p2.x=this.p1.x+e*b;this.p2.y=this.p1.y+f*b};Z.prototype.ExtendBackward=function(b){var e=-this.p2.x+this.p1.x,
f=-this.p2.y+this.p1.y;b=Math.min(e>0?(b.upperBound.x-this.p2.x)/e:e<0?(b.lowerBound.x-this.p2.x)/e:Number.POSITIVE_INFINITY,f>0?(b.upperBound.y-this.p2.y)/f:f<0?(b.lowerBound.y-this.p2.y)/f:Number.POSITIVE_INFINITY);this.p1.x=this.p2.x+e*b;this.p1.y=this.p2.y+f*b};d.b2SeparationFunction=function(){this.m_localPoint=new p;this.m_axis=new p};d.prototype.Initialize=function(b,e,f,m,r){this.m_proxyA=e;this.m_proxyB=m;var s=parseInt(b.count);y.b2Assert(0<s&&s<3);var v,t,x,C,J=C=x=m=e=0,T=0;J=0;if(s==
1){this.m_type=d.e_points;v=this.m_proxyA.GetVertex(b.indexA[0]);t=this.m_proxyB.GetVertex(b.indexB[0]);s=v;b=f.R;e=f.position.x+(b.col1.x*s.x+b.col2.x*s.y);m=f.position.y+(b.col1.y*s.x+b.col2.y*s.y);s=t;b=r.R;x=r.position.x+(b.col1.x*s.x+b.col2.x*s.y);C=r.position.y+(b.col1.y*s.x+b.col2.y*s.y);this.m_axis.x=x-e;this.m_axis.y=C-m;this.m_axis.Normalize()}else{if(b.indexB[0]==b.indexB[1]){this.m_type=d.e_faceA;e=this.m_proxyA.GetVertex(b.indexA[0]);m=this.m_proxyA.GetVertex(b.indexA[1]);t=this.m_proxyB.GetVertex(b.indexB[0]);
this.m_localPoint.x=0.5*(e.x+m.x);this.m_localPoint.y=0.5*(e.y+m.y);this.m_axis=w.CrossVF(w.SubtractVV(m,e),1);this.m_axis.Normalize();s=this.m_axis;b=f.R;J=b.col1.x*s.x+b.col2.x*s.y;T=b.col1.y*s.x+b.col2.y*s.y;s=this.m_localPoint;b=f.R;e=f.position.x+(b.col1.x*s.x+b.col2.x*s.y);m=f.position.y+(b.col1.y*s.x+b.col2.y*s.y);s=t;b=r.R;x=r.position.x+(b.col1.x*s.x+b.col2.x*s.y);C=r.position.y+(b.col1.y*s.x+b.col2.y*s.y);J=(x-e)*J+(C-m)*T}else if(b.indexA[0]==b.indexA[0]){this.m_type=d.e_faceB;x=this.m_proxyB.GetVertex(b.indexB[0]);
C=this.m_proxyB.GetVertex(b.indexB[1]);v=this.m_proxyA.GetVertex(b.indexA[0]);this.m_localPoint.x=0.5*(x.x+C.x);this.m_localPoint.y=0.5*(x.y+C.y);this.m_axis=w.CrossVF(w.SubtractVV(C,x),1);this.m_axis.Normalize();s=this.m_axis;b=r.R;J=b.col1.x*s.x+b.col2.x*s.y;T=b.col1.y*s.x+b.col2.y*s.y;s=this.m_localPoint;b=r.R;x=r.position.x+(b.col1.x*s.x+b.col2.x*s.y);C=r.position.y+(b.col1.y*s.x+b.col2.y*s.y);s=v;b=f.R;e=f.position.x+(b.col1.x*s.x+b.col2.x*s.y);m=f.position.y+(b.col1.y*s.x+b.col2.y*s.y);J=(e-
x)*J+(m-C)*T}else{e=this.m_proxyA.GetVertex(b.indexA[0]);m=this.m_proxyA.GetVertex(b.indexA[1]);x=this.m_proxyB.GetVertex(b.indexB[0]);C=this.m_proxyB.GetVertex(b.indexB[1]);w.MulX(f,v);v=w.MulMV(f.R,w.SubtractVV(m,e));w.MulX(r,t);J=w.MulMV(r.R,w.SubtractVV(C,x));r=v.x*v.x+v.y*v.y;t=J.x*J.x+J.y*J.y;b=w.SubtractVV(J,v);f=v.x*b.x+v.y*b.y;b=J.x*b.x+J.y*b.y;v=v.x*J.x+v.y*J.y;T=r*t-v*v;J=0;if(T!=0)J=w.Clamp((v*b-f*t)/T,0,1);if((v*J+b)/t<0)J=w.Clamp((v-f)/r,0,1);v=new p;v.x=e.x+J*(m.x-e.x);v.y=e.y+J*(m.y-
e.y);t=new p;t.x=x.x+J*(C.x-x.x);t.y=x.y+J*(C.y-x.y);if(J==0||J==1){this.m_type=d.e_faceB;this.m_axis=w.CrossVF(w.SubtractVV(C,x),1);this.m_axis.Normalize();this.m_localPoint=t}else{this.m_type=d.e_faceA;this.m_axis=w.CrossVF(w.SubtractVV(m,e),1);this.m_localPoint=v}}J<0&&this.m_axis.NegativeSelf()}};d.prototype.Evaluate=function(b,e){var f,m,r=0;switch(this.m_type){case d.e_points:f=w.MulTMV(b.R,this.m_axis);m=w.MulTMV(e.R,this.m_axis.GetNegative());f=this.m_proxyA.GetSupportVertex(f);m=this.m_proxyB.GetSupportVertex(m);
f=w.MulX(b,f);m=w.MulX(e,m);return r=(m.x-f.x)*this.m_axis.x+(m.y-f.y)*this.m_axis.y;case d.e_faceA:r=w.MulMV(b.R,this.m_axis);f=w.MulX(b,this.m_localPoint);m=w.MulTMV(e.R,r.GetNegative());m=this.m_proxyB.GetSupportVertex(m);m=w.MulX(e,m);return r=(m.x-f.x)*r.x+(m.y-f.y)*r.y;case d.e_faceB:r=w.MulMV(e.R,this.m_axis);m=w.MulX(e,this.m_localPoint);f=w.MulTMV(b.R,r.GetNegative());f=this.m_proxyA.GetSupportVertex(f);f=w.MulX(b,f);return r=(f.x-m.x)*r.x+(f.y-m.y)*r.y;default:y.b2Assert(false);return 0}};
Box2D.postDefs.push(function(){Box2D.Collision.b2SeparationFunction.e_points=1;Box2D.Collision.b2SeparationFunction.e_faceA=2;Box2D.Collision.b2SeparationFunction.e_faceB=4});h.b2Simplex=function(){this.m_v1=new j;this.m_v2=new j;this.m_v3=new j;this.m_vertices=new Vector(3)};h.prototype.b2Simplex=function(){this.m_vertices[0]=this.m_v1;this.m_vertices[1]=this.m_v2;this.m_vertices[2]=this.m_v3};h.prototype.ReadCache=function(b,e,f,m,r){y.b2Assert(0<=b.count&&b.count<=3);var s,v;this.m_count=b.count;
for(var t=this.m_vertices,x=0;x<this.m_count;x++){var C=t[x];C.indexA=b.indexA[x];C.indexB=b.indexB[x];s=e.GetVertex(C.indexA);v=m.GetVertex(C.indexB);C.wA=w.MulX(f,s);C.wB=w.MulX(r,v);C.w=w.SubtractVV(C.wB,C.wA);C.a=0}if(this.m_count>1){b=b.metric;s=this.GetMetric();if(s<0.5*b||2*b<s||s<Number.MIN_VALUE)this.m_count=0}if(this.m_count==0){C=t[0];C.indexA=0;C.indexB=0;s=e.GetVertex(0);v=m.GetVertex(0);C.wA=w.MulX(f,s);C.wB=w.MulX(r,v);C.w=w.SubtractVV(C.wB,C.wA);this.m_count=1}};h.prototype.WriteCache=
function(b){b.metric=this.GetMetric();b.count=Box2D.parseUInt(this.m_count);for(var e=this.m_vertices,f=0;f<this.m_count;f++){b.indexA[f]=Box2D.parseUInt(e[f].indexA);b.indexB[f]=Box2D.parseUInt(e[f].indexB)}};h.prototype.GetSearchDirection=function(){switch(this.m_count){case 1:return this.m_v1.w.GetNegative();case 2:var b=w.SubtractVV(this.m_v2.w,this.m_v1.w);return w.CrossVV(b,this.m_v1.w.GetNegative())>0?w.CrossFV(1,b):w.CrossVF(b,1);default:y.b2Assert(false);return new p}};h.prototype.GetClosestPoint=
function(){switch(this.m_count){case 0:y.b2Assert(false);return new p;case 1:return this.m_v1.w;case 2:return new p(this.m_v1.a*this.m_v1.w.x+this.m_v2.a*this.m_v2.w.x,this.m_v1.a*this.m_v1.w.y+this.m_v2.a*this.m_v2.w.y);default:y.b2Assert(false);return new p}};h.prototype.GetWitnessPoints=function(b,e){switch(this.m_count){case 0:y.b2Assert(false);break;case 1:b.SetV(this.m_v1.wA);e.SetV(this.m_v1.wB);break;case 2:b.x=this.m_v1.a*this.m_v1.wA.x+this.m_v2.a*this.m_v2.wA.x;b.y=this.m_v1.a*this.m_v1.wA.y+
this.m_v2.a*this.m_v2.wA.y;e.x=this.m_v1.a*this.m_v1.wB.x+this.m_v2.a*this.m_v2.wB.x;e.y=this.m_v1.a*this.m_v1.wB.y+this.m_v2.a*this.m_v2.wB.y;break;case 3:e.x=b.x=this.m_v1.a*this.m_v1.wA.x+this.m_v2.a*this.m_v2.wA.x+this.m_v3.a*this.m_v3.wA.x;e.y=b.y=this.m_v1.a*this.m_v1.wA.y+this.m_v2.a*this.m_v2.wA.y+this.m_v3.a*this.m_v3.wA.y;break;default:y.b2Assert(false)}};h.prototype.GetMetric=function(){switch(this.m_count){case 0:y.b2Assert(false);return 0;case 1:return 0;case 2:return w.SubtractVV(this.m_v1.w,
this.m_v2.w).Length();case 3:return w.CrossVV(w.SubtractVV(this.m_v2.w,this.m_v1.w),w.SubtractVV(this.m_v3.w,this.m_v1.w));default:y.b2Assert(false);return 0}};h.prototype.Solve2=function(){var b=this.m_v1.w,e=this.m_v2.w,f=w.SubtractVV(e,b);b=-(b.x*f.x+b.y*f.y);if(b<=0)this.m_count=this.m_v1.a=1;else{e=e.x*f.x+e.y*f.y;if(e<=0){this.m_count=this.m_v2.a=1;this.m_v1.Set(this.m_v2)}else{f=1/(e+b);this.m_v1.a=e*f;this.m_v2.a=b*f;this.m_count=2}}};h.prototype.Solve3=function(){var b=this.m_v1.w,e=this.m_v2.w,
f=this.m_v3.w,m=w.SubtractVV(e,b),r=w.Dot(b,m),s=w.Dot(e,m);r=-r;var v=w.SubtractVV(f,b),t=w.Dot(b,v),x=w.Dot(f,v);t=-t;var C=w.SubtractVV(f,e),J=w.Dot(e,C);C=w.Dot(f,C);J=-J;v=w.CrossVV(m,v);m=v*w.CrossVV(e,f);f=v*w.CrossVV(f,b);b=v*w.CrossVV(b,e);if(r<=0&&t<=0)this.m_count=this.m_v1.a=1;else if(s>0&&r>0&&b<=0){x=1/(s+r);this.m_v1.a=s*x;this.m_v2.a=r*x;this.m_count=2}else if(x>0&&t>0&&f<=0){s=1/(x+t);this.m_v1.a=x*s;this.m_v3.a=t*s;this.m_count=2;this.m_v2.Set(this.m_v3)}else if(s<=0&&J<=0){this.m_count=
this.m_v2.a=1;this.m_v1.Set(this.m_v2)}else if(x<=0&&C<=0){this.m_count=this.m_v3.a=1;this.m_v1.Set(this.m_v3)}else if(C>0&&J>0&&m<=0){s=1/(C+J);this.m_v2.a=C*s;this.m_v3.a=J*s;this.m_count=2;this.m_v1.Set(this.m_v3)}else{s=1/(m+f+b);this.m_v1.a=m*s;this.m_v2.a=f*s;this.m_v3.a=b*s;this.m_count=3}};l.b2SimplexCache=function(){this.indexA=new Vector_a2j_Number(3);this.indexB=new Vector_a2j_Number(3)};j.b2SimplexVertex=function(){};j.prototype.Set=function(b){this.wA.SetV(b.wA);this.wB.SetV(b.wB);this.w.SetV(b.w);
this.a=b.a;this.indexA=b.indexA;this.indexB=b.indexB};o.b2TimeOfImpact=function(){};o.TimeOfImpact=function(b){++o.b2_toiCalls;var e=b.proxyA,f=b.proxyB,m=b.sweepA,r=b.sweepB;y.b2Assert(m.t0==r.t0);y.b2Assert(1-m.t0>Number.MIN_VALUE);var s=e.m_radius+f.m_radius;b=b.tolerance;var v=0,t=0,x=0;o.s_cache.count=0;for(o.s_distanceInput.useRadii=false;;){m.GetTransform(o.s_xfA,v);r.GetTransform(o.s_xfB,v);o.s_distanceInput.proxyA=e;o.s_distanceInput.proxyB=f;o.s_distanceInput.transformA=o.s_xfA;o.s_distanceInput.transformB=
o.s_xfB;W.Distance(o.s_distanceOutput,o.s_cache,o.s_distanceInput);if(o.s_distanceOutput.distance<=0){v=1;break}o.s_fcn.Initialize(o.s_cache,e,o.s_xfA,f,o.s_xfB);var C=o.s_fcn.Evaluate(o.s_xfA,o.s_xfB);if(C<=0){v=1;break}if(t==0)x=C>s?w.Max(s-b,0.75*s):w.Max(C-b,0.02*s);if(C-x<0.5*b){if(t==0){v=1;break}break}var J=v,T=v,P=1;C=C;m.GetTransform(o.s_xfA,P);r.GetTransform(o.s_xfB,P);var X=o.s_fcn.Evaluate(o.s_xfA,o.s_xfB);if(X>=x){v=1;break}for(var $=0;;){var ba=0;ba=$&1?T+(x-C)*(P-T)/(X-C):0.5*(T+P);
m.GetTransform(o.s_xfA,ba);r.GetTransform(o.s_xfB,ba);var ca=o.s_fcn.Evaluate(o.s_xfA,o.s_xfB);if(w.Abs(ca-x)<0.025*b){J=ba;break}if(ca>x){T=ba;C=ca}else{P=ba;X=ca}++$;++o.b2_toiRootIters;if($==50)break}o.b2_toiMaxRootIters=w.Max(o.b2_toiMaxRootIters,$);if(J<(1+100*Number.MIN_VALUE)*v)break;v=J;t++;++o.b2_toiIters;if(t==1E3)break}o.b2_toiMaxIters=w.Max(o.b2_toiMaxIters,t);return v};Box2D.postDefs.push(function(){Box2D.Collision.b2TimeOfImpact.b2_toiCalls=0;Box2D.Collision.b2TimeOfImpact.b2_toiIters=
0;Box2D.Collision.b2TimeOfImpact.b2_toiMaxIters=0;Box2D.Collision.b2TimeOfImpact.b2_toiRootIters=0;Box2D.Collision.b2TimeOfImpact.b2_toiMaxRootIters=0;Box2D.Collision.b2TimeOfImpact.s_cache=new l;Box2D.Collision.b2TimeOfImpact.s_distanceInput=new Y;Box2D.Collision.b2TimeOfImpact.s_xfA=new U;Box2D.Collision.b2TimeOfImpact.s_xfB=new U;Box2D.Collision.b2TimeOfImpact.s_fcn=new d;Box2D.Collision.b2TimeOfImpact.s_distanceOutput=new k});q.b2TOIInput=function(){this.proxyA=new z;this.proxyB=new z;this.sweepA=
new A;this.sweepB=new A};n.b2WorldManifold=function(){this.m_normal=new p};n.prototype.b2WorldManifold=function(){this.m_points=new Vector(y.b2_maxManifoldPoints);for(var b=0;b<y.b2_maxManifoldPoints;b++)this.m_points[b]=new p};n.prototype.Initialize=function(b,e,f,m,r){if(f===undefined)f=0;if(r===undefined)r=0;if(b.m_pointCount!=0){var s=0,v,t,x=0,C=0,J=0,T=0,P=0;v=0;switch(b.m_type){case E.e_circles:t=e.R;v=b.m_localPoint;s=e.position.x+t.col1.x*v.x+t.col2.x*v.y;e=e.position.y+t.col1.y*v.x+t.col2.y*
v.y;t=m.R;v=b.m_points[0].m_localPoint;b=m.position.x+t.col1.x*v.x+t.col2.x*v.y;m=m.position.y+t.col1.y*v.x+t.col2.y*v.y;v=b-s;t=m-e;x=v*v+t*t;if(x>Number.MIN_VALUE*Number.MIN_VALUE){x=Math.sqrt(x);this.m_normal.x=v/x;this.m_normal.y=t/x}else{this.m_normal.x=1;this.m_normal.y=0}v=e+f*this.m_normal.y;m=m-r*this.m_normal.y;this.m_points[0].x=0.5*(s+f*this.m_normal.x+(b-r*this.m_normal.x));this.m_points[0].y=0.5*(v+m);break;case E.e_faceA:t=e.R;v=b.m_localPlaneNormal;x=t.col1.x*v.x+t.col2.x*v.y;C=t.col1.y*
v.x+t.col2.y*v.y;t=e.R;v=b.m_localPoint;J=e.position.x+t.col1.x*v.x+t.col2.x*v.y;T=e.position.y+t.col1.y*v.x+t.col2.y*v.y;this.m_normal.x=x;this.m_normal.y=C;for(s=0;s<b.m_pointCount;s++){t=m.R;v=b.m_points[s].m_localPoint;P=m.position.x+t.col1.x*v.x+t.col2.x*v.y;v=m.position.y+t.col1.y*v.x+t.col2.y*v.y;this.m_points[s].x=P+0.5*(f-(P-J)*x-(v-T)*C-r)*x;this.m_points[s].y=v+0.5*(f-(P-J)*x-(v-T)*C-r)*C}break;case E.e_faceB:t=m.R;v=b.m_localPlaneNormal;x=t.col1.x*v.x+t.col2.x*v.y;C=t.col1.y*v.x+t.col2.y*
v.y;t=m.R;v=b.m_localPoint;J=m.position.x+t.col1.x*v.x+t.col2.x*v.y;T=m.position.y+t.col1.y*v.x+t.col2.y*v.y;this.m_normal.x=-x;this.m_normal.y=-C;for(s=0;s<b.m_pointCount;s++){t=e.R;v=b.m_points[s].m_localPoint;P=e.position.x+t.col1.x*v.x+t.col2.x*v.y;v=e.position.y+t.col1.y*v.x+t.col2.y*v.y;this.m_points[s].x=P+0.5*(r-(P-J)*x-(v-T)*C-f)*x;this.m_points[s].y=v+0.5*(r-(P-J)*x-(v-T)*C-f)*C}}}};a.ClipVertex=function(){this.v=new p;this.id=new L};a.prototype.Set=function(b){this.v.SetV(b.v);this.id.Set(b.id)};
c.Features=function(){};Object.defineProperty(c.prototype,"referenceEdge",{enumerable:false,configurable:true,get:function(){return this._referenceEdge}});Object.defineProperty(c.prototype,"referenceEdge",{enumerable:false,configurable:true,set:function(b){if(b===undefined)b=0;this._referenceEdge=b;this._m_id._key=this._m_id._key&4294967040|this._referenceEdge&255}});Object.defineProperty(c.prototype,"incidentEdge",{enumerable:false,configurable:true,get:function(){return this._incidentEdge}});Object.defineProperty(c.prototype,
"incidentEdge",{enumerable:false,configurable:true,set:function(b){if(b===undefined)b=0;this._incidentEdge=b;this._m_id._key=this._m_id._key&4294902015|this._incidentEdge<<8&65280}});Object.defineProperty(c.prototype,"incidentVertex",{enumerable:false,configurable:true,get:function(){return this._incidentVertex}});Object.defineProperty(c.prototype,"incidentVertex",{enumerable:false,configurable:true,set:function(b){if(b===undefined)b=0;this._incidentVertex=b;this._m_id._key=this._m_id._key&4278255615|
this._incidentVertex<<16&16711680}});Object.defineProperty(c.prototype,"flip",{enumerable:false,configurable:true,get:function(){return this._flip}});Object.defineProperty(c.prototype,"flip",{enumerable:false,configurable:true,set:function(b){if(b===undefined)b=0;this._flip=b;this._m_id._key=this._m_id._key&16777215|this._flip<<24&4278190080}})})();
(function(){var F=Box2D.Common.b2Settings,G=Box2D.Collision.Shapes.b2CircleShape,K=Box2D.Collision.Shapes.b2EdgeChainDef,y=Box2D.Collision.Shapes.b2EdgeShape,w=Box2D.Collision.Shapes.b2MassData,A=Box2D.Collision.Shapes.b2PolygonShape,U=Box2D.Collision.Shapes.b2Shape,p=Box2D.Common.Math.b2Mat22,B=Box2D.Common.Math.b2Math,Q=Box2D.Common.Math.b2Transform,V=Box2D.Common.Math.b2Vec2,M=Box2D.Collision.b2Distance,L=Box2D.Collision.b2DistanceInput,I=Box2D.Collision.b2DistanceOutput,W=Box2D.Collision.b2DistanceProxy,
Y=Box2D.Collision.b2SimplexCache;Box2D.inherit(G,Box2D.Collision.Shapes.b2Shape);G.prototype.__super=Box2D.Collision.Shapes.b2Shape.prototype;G.b2CircleShape=function(){Box2D.Collision.Shapes.b2Shape.b2Shape.apply(this,arguments);this.m_p=new V};G.prototype.Copy=function(){var k=new G;k.Set(this);return k};G.prototype.Set=function(k){this.__super.Set.call(this,k);if(Box2D.is(k,G))this.m_p.SetV((k instanceof G?k:null).m_p)};G.prototype.TestPoint=function(k,z){var u=k.R,D=k.position.x+(u.col1.x*this.m_p.x+
u.col2.x*this.m_p.y);u=k.position.y+(u.col1.y*this.m_p.x+u.col2.y*this.m_p.y);D=z.x-D;u=z.y-u;return D*D+u*u<=this.m_radius*this.m_radius};G.prototype.RayCast=function(k,z,u){var D=u.R,H=z.p1.x-(u.position.x+(D.col1.x*this.m_p.x+D.col2.x*this.m_p.y));u=z.p1.y-(u.position.y+(D.col1.y*this.m_p.x+D.col2.y*this.m_p.y));D=z.p2.x-z.p1.x;var O=z.p2.y-z.p1.y,E=H*D+u*O,R=D*D+O*O,N=E*E-R*(H*H+u*u-this.m_radius*this.m_radius);if(N<0||R<Number.MIN_VALUE)return false;E=-(E+Math.sqrt(N));if(0<=E&&E<=z.maxFraction*
R){E/=R;k.fraction=E;k.normal.x=H+E*D;k.normal.y=u+E*O;k.normal.Normalize();return true}return false};G.prototype.ComputeAABB=function(k,z){var u=z.R,D=z.position.x+(u.col1.x*this.m_p.x+u.col2.x*this.m_p.y);u=z.position.y+(u.col1.y*this.m_p.x+u.col2.y*this.m_p.y);k.lowerBound.Set(D-this.m_radius,u-this.m_radius);k.upperBound.Set(D+this.m_radius,u+this.m_radius)};G.prototype.ComputeMass=function(k,z){if(z===undefined)z=0;k.mass=z*F.b2_pi*this.m_radius*this.m_radius;k.center.SetV(this.m_p);k.I=k.mass*
(0.5*this.m_radius*this.m_radius+(this.m_p.x*this.m_p.x+this.m_p.y*this.m_p.y))};G.prototype.ComputeSubmergedArea=function(k,z,u,D){if(z===undefined)z=0;u=B.MulX(u,this.m_p);var H=-(B.Dot(k,u)-z);if(H<-this.m_radius+Number.MIN_VALUE)return 0;if(H>this.m_radius){D.SetV(u);return Math.PI*this.m_radius*this.m_radius}z=this.m_radius*this.m_radius;var O=H*H;H=z*(Math.asin(H/this.m_radius)+Math.PI/2)+H*Math.sqrt(z-O);z=-2/3*Math.pow(z-O,1.5)/H;D.x=u.x+k.x*z;D.y=u.y+k.y*z;return H};G.prototype.GetLocalPosition=
function(){return this.m_p};G.prototype.SetLocalPosition=function(k){this.m_p.SetV(k)};G.prototype.GetRadius=function(){return this.m_radius};G.prototype.SetRadius=function(k){if(k===undefined)k=0;this.m_radius=k};G.prototype.b2CircleShape=function(k){if(k===undefined)k=0;this.__super.b2Shape.call(this);this.m_type=U.e_circleShape;this.m_radius=k};K.b2EdgeChainDef=function(){};K.prototype.b2EdgeChainDef=function(){this.vertexCount=0;this.isALoop=true;this.vertices=[]};Box2D.inherit(y,Box2D.Collision.Shapes.b2Shape);
y.prototype.__super=Box2D.Collision.Shapes.b2Shape.prototype;y.b2EdgeShape=function(){Box2D.Collision.Shapes.b2Shape.b2Shape.apply(this,arguments);this.s_supportVec=new V;this.m_v1=new V;this.m_v2=new V;this.m_coreV1=new V;this.m_coreV2=new V;this.m_normal=new V;this.m_direction=new V;this.m_cornerDir1=new V;this.m_cornerDir2=new V};y.prototype.TestPoint=function(){return false};y.prototype.RayCast=function(k,z,u){var D,H=z.p2.x-z.p1.x,O=z.p2.y-z.p1.y;D=u.R;var E=u.position.x+(D.col1.x*this.m_v1.x+
D.col2.x*this.m_v1.y),R=u.position.y+(D.col1.y*this.m_v1.x+D.col2.y*this.m_v1.y),N=u.position.y+(D.col1.y*this.m_v2.x+D.col2.y*this.m_v2.y)-R;u=-(u.position.x+(D.col1.x*this.m_v2.x+D.col2.x*this.m_v2.y)-E);D=100*Number.MIN_VALUE;var S=-(H*N+O*u);if(S>D){E=z.p1.x-E;var aa=z.p1.y-R;R=E*N+aa*u;if(0<=R&&R<=z.maxFraction*S){z=-H*aa+O*E;if(-D*S<=z&&z<=S*(1+D)){R/=S;k.fraction=R;z=Math.sqrt(N*N+u*u);k.normal.x=N/z;k.normal.y=u/z;return true}}}return false};y.prototype.ComputeAABB=function(k,z){var u=z.R,
D=z.position.x+(u.col1.x*this.m_v1.x+u.col2.x*this.m_v1.y),H=z.position.y+(u.col1.y*this.m_v1.x+u.col2.y*this.m_v1.y),O=z.position.x+(u.col1.x*this.m_v2.x+u.col2.x*this.m_v2.y);u=z.position.y+(u.col1.y*this.m_v2.x+u.col2.y*this.m_v2.y);if(D<O){k.lowerBound.x=D;k.upperBound.x=O}else{k.lowerBound.x=O;k.upperBound.x=D}if(H<u){k.lowerBound.y=H;k.upperBound.y=u}else{k.lowerBound.y=u;k.upperBound.y=H}};y.prototype.ComputeMass=function(k){k.mass=0;k.center.SetV(this.m_v1);k.I=0};y.prototype.ComputeSubmergedArea=
function(k,z,u,D){if(z===undefined)z=0;var H=new V(k.x*z,k.y*z),O=B.MulX(u,this.m_v1);u=B.MulX(u,this.m_v2);var E=B.Dot(k,O)-z;k=B.Dot(k,u)-z;if(E>0)if(k>0)return 0;else{O.x=-k/(E-k)*O.x+E/(E-k)*u.x;O.y=-k/(E-k)*O.y+E/(E-k)*u.y}else if(k>0){u.x=-k/(E-k)*O.x+E/(E-k)*u.x;u.y=-k/(E-k)*O.y+E/(E-k)*u.y}D.x=(H.x+O.x+u.x)/3;D.y=(H.y+O.y+u.y)/3;return 0.5*((O.x-H.x)*(u.y-H.y)-(O.y-H.y)*(u.x-H.x))};y.prototype.GetLength=function(){return this.m_length};y.prototype.GetVertex1=function(){return this.m_v1};y.prototype.GetVertex2=
function(){return this.m_v2};y.prototype.GetCoreVertex1=function(){return this.m_coreV1};y.prototype.GetCoreVertex2=function(){return this.m_coreV2};y.prototype.GetNormalVector=function(){return this.m_normal};y.prototype.GetDirectionVector=function(){return this.m_direction};y.prototype.GetCorner1Vector=function(){return this.m_cornerDir1};y.prototype.GetCorner2Vector=function(){return this.m_cornerDir2};y.prototype.Corner1IsConvex=function(){return this.m_cornerConvex1};y.prototype.Corner2IsConvex=
function(){return this.m_cornerConvex2};y.prototype.GetFirstVertex=function(k){var z=k.R;return new V(k.position.x+(z.col1.x*this.m_coreV1.x+z.col2.x*this.m_coreV1.y),k.position.y+(z.col1.y*this.m_coreV1.x+z.col2.y*this.m_coreV1.y))};y.prototype.GetNextEdge=function(){return this.m_nextEdge};y.prototype.GetPrevEdge=function(){return this.m_prevEdge};y.prototype.Support=function(k,z,u){if(z===undefined)z=0;if(u===undefined)u=0;var D=k.R,H=k.position.x+(D.col1.x*this.m_coreV1.x+D.col2.x*this.m_coreV1.y),
O=k.position.y+(D.col1.y*this.m_coreV1.x+D.col2.y*this.m_coreV1.y),E=k.position.x+(D.col1.x*this.m_coreV2.x+D.col2.x*this.m_coreV2.y);k=k.position.y+(D.col1.y*this.m_coreV2.x+D.col2.y*this.m_coreV2.y);if(H*z+O*u>E*z+k*u){this.s_supportVec.x=H;this.s_supportVec.y=O}else{this.s_supportVec.x=E;this.s_supportVec.y=k}return this.s_supportVec};y.prototype.b2EdgeShape=function(k,z){this.__super.b2Shape.call(this);this.m_type=U.e_edgeShape;this.m_nextEdge=this.m_prevEdge=null;this.m_v1=k;this.m_v2=z;this.m_direction.Set(this.m_v2.x-
this.m_v1.x,this.m_v2.y-this.m_v1.y);this.m_length=this.m_direction.Normalize();this.m_normal.Set(this.m_direction.y,-this.m_direction.x);this.m_coreV1.Set(-F.b2_toiSlop*(this.m_normal.x-this.m_direction.x)+this.m_v1.x,-F.b2_toiSlop*(this.m_normal.y-this.m_direction.y)+this.m_v1.y);this.m_coreV2.Set(-F.b2_toiSlop*(this.m_normal.x+this.m_direction.x)+this.m_v2.x,-F.b2_toiSlop*(this.m_normal.y+this.m_direction.y)+this.m_v2.y);this.m_cornerDir1=this.m_normal;this.m_cornerDir2.Set(-this.m_normal.x,-this.m_normal.y)};
y.prototype.SetPrevEdge=function(k,z,u,D){this.m_prevEdge=k;this.m_coreV1=z;this.m_cornerDir1=u;this.m_cornerConvex1=D};y.prototype.SetNextEdge=function(k,z,u,D){this.m_nextEdge=k;this.m_coreV2=z;this.m_cornerDir2=u;this.m_cornerConvex2=D};w.b2MassData=function(){this.mass=0;this.center=new V(0,0);this.I=0};Box2D.inherit(A,Box2D.Collision.Shapes.b2Shape);A.prototype.__super=Box2D.Collision.Shapes.b2Shape.prototype;A.b2PolygonShape=function(){Box2D.Collision.Shapes.b2Shape.b2Shape.apply(this,arguments)};
A.prototype.Copy=function(){var k=new A;k.Set(this);return k};A.prototype.Set=function(k){this.__super.Set.call(this,k);if(Box2D.is(k,A)){k=k instanceof A?k:null;this.m_centroid.SetV(k.m_centroid);this.m_vertexCount=k.m_vertexCount;this.Reserve(this.m_vertexCount);for(var z=0;z<this.m_vertexCount;z++){this.m_vertices[z].SetV(k.m_vertices[z]);this.m_normals[z].SetV(k.m_normals[z])}}};A.prototype.SetAsArray=function(k,z){if(z===undefined)z=0;var u=new Vector,D=0,H;for(D=0;D<k.length;++D){H=k[D];u.push(H)}this.SetAsVector(u,
z)};A.AsArray=function(k,z){if(z===undefined)z=0;var u=new A;u.SetAsArray(k,z);return u};A.prototype.SetAsVector=function(k,z){if(z===undefined)z=0;if(z==0)z=k.length;F.b2Assert(2<=z);this.m_vertexCount=z;this.Reserve(z);var u=0;for(u=0;u<this.m_vertexCount;u++)this.m_vertices[u].SetV(k[u]);for(u=0;u<this.m_vertexCount;++u){var D=parseInt(u),H=parseInt(u+1<this.m_vertexCount?u+1:0);D=B.SubtractVV(this.m_vertices[H],this.m_vertices[D]);F.b2Assert(D.LengthSquared()>Number.MIN_VALUE);this.m_normals[u].SetV(B.CrossVF(D,
1));this.m_normals[u].Normalize()}this.m_centroid=A.ComputeCentroid(this.m_vertices,this.m_vertexCount)};A.AsVector=function(k,z){if(z===undefined)z=0;var u=new A;u.SetAsVector(k,z);return u};A.prototype.SetAsBox=function(k,z){if(k===undefined)k=0;if(z===undefined)z=0;this.m_vertexCount=4;this.Reserve(4);this.m_vertices[0].Set(-k,-z);this.m_vertices[1].Set(k,-z);this.m_vertices[2].Set(k,z);this.m_vertices[3].Set(-k,z);this.m_normals[0].Set(0,-1);this.m_normals[1].Set(1,0);this.m_normals[2].Set(0,
1);this.m_normals[3].Set(-1,0);this.m_centroid.SetZero()};A.AsBox=function(k,z){if(k===undefined)k=0;if(z===undefined)z=0;var u=new A;u.SetAsBox(k,z);return u};A.prototype.SetAsOrientedBox=function(k,z,u,D){if(k===undefined)k=0;if(z===undefined)z=0;if(u===undefined)u=null;if(D===undefined)D=0;this.m_vertexCount=4;this.Reserve(4);this.m_vertices[0].Set(-k,-z);this.m_vertices[1].Set(k,-z);this.m_vertices[2].Set(k,z);this.m_vertices[3].Set(-k,z);this.m_normals[0].Set(0,-1);this.m_normals[1].Set(1,0);
this.m_normals[2].Set(0,1);this.m_normals[3].Set(-1,0);this.m_centroid=u;k=new Q;k.position=u;k.R.Set(D);for(u=0;u<this.m_vertexCount;++u){this.m_vertices[u]=B.MulX(k,this.m_vertices[u]);this.m_normals[u]=B.MulMV(k.R,this.m_normals[u])}};A.AsOrientedBox=function(k,z,u,D){if(k===undefined)k=0;if(z===undefined)z=0;if(u===undefined)u=null;if(D===undefined)D=0;var H=new A;H.SetAsOrientedBox(k,z,u,D);return H};A.prototype.SetAsEdge=function(k,z){this.m_vertexCount=2;this.Reserve(2);this.m_vertices[0].SetV(k);
this.m_vertices[1].SetV(z);this.m_centroid.x=0.5*(k.x+z.x);this.m_centroid.y=0.5*(k.y+z.y);this.m_normals[0]=B.CrossVF(B.SubtractVV(z,k),1);this.m_normals[0].Normalize();this.m_normals[1].x=-this.m_normals[0].x;this.m_normals[1].y=-this.m_normals[0].y};A.AsEdge=function(k,z){var u=new A;u.SetAsEdge(k,z);return u};A.prototype.TestPoint=function(k,z){var u;u=k.R;for(var D=z.x-k.position.x,H=z.y-k.position.y,O=D*u.col1.x+H*u.col1.y,E=D*u.col2.x+H*u.col2.y,R=0;R<this.m_vertexCount;++R){u=this.m_vertices[R];
D=O-u.x;H=E-u.y;u=this.m_normals[R];if(u.x*D+u.y*H>0)return false}return true};A.prototype.RayCast=function(k,z,u){var D=0,H=z.maxFraction,O=0,E=0,R,N;O=z.p1.x-u.position.x;E=z.p1.y-u.position.y;R=u.R;var S=O*R.col1.x+E*R.col1.y,aa=O*R.col2.x+E*R.col2.y;O=z.p2.x-u.position.x;E=z.p2.y-u.position.y;R=u.R;z=O*R.col1.x+E*R.col1.y-S;R=O*R.col2.x+E*R.col2.y-aa;for(var Z=parseInt(-1),d=0;d<this.m_vertexCount;++d){N=this.m_vertices[d];O=N.x-S;E=N.y-aa;N=this.m_normals[d];O=N.x*O+N.y*E;E=N.x*z+N.y*R;if(E==
0){if(O<0)return false}else if(E<0&&O<D*E){D=O/E;Z=d}else if(E>0&&O<H*E)H=O/E;if(H<D-Number.MIN_VALUE)return false}if(Z>=0){k.fraction=D;R=u.R;N=this.m_normals[Z];k.normal.x=R.col1.x*N.x+R.col2.x*N.y;k.normal.y=R.col1.y*N.x+R.col2.y*N.y;return true}return false};A.prototype.ComputeAABB=function(k,z){for(var u=z.R,D=this.m_vertices[0],H=z.position.x+(u.col1.x*D.x+u.col2.x*D.y),O=z.position.y+(u.col1.y*D.x+u.col2.y*D.y),E=H,R=O,N=1;N<this.m_vertexCount;++N){D=this.m_vertices[N];var S=z.position.x+(u.col1.x*
D.x+u.col2.x*D.y);D=z.position.y+(u.col1.y*D.x+u.col2.y*D.y);H=H<S?H:S;O=O<D?O:D;E=E>S?E:S;R=R>D?R:D}k.lowerBound.x=H-this.m_radius;k.lowerBound.y=O-this.m_radius;k.upperBound.x=E+this.m_radius;k.upperBound.y=R+this.m_radius};A.prototype.ComputeMass=function(k,z){if(z===undefined)z=0;if(this.m_vertexCount==2){k.center.x=0.5*(this.m_vertices[0].x+this.m_vertices[1].x);k.center.y=0.5*(this.m_vertices[0].y+this.m_vertices[1].y);k.mass=0;k.I=0}else{for(var u=0,D=0,H=0,O=0,E=1/3,R=0;R<this.m_vertexCount;++R){var N=
this.m_vertices[R],S=R+1<this.m_vertexCount?this.m_vertices[parseInt(R+1)]:this.m_vertices[0],aa=N.x-0,Z=N.y-0,d=S.x-0,h=S.y-0,l=aa*h-Z*d,j=0.5*l;H+=j;u+=j*E*(0+N.x+S.x);D+=j*E*(0+N.y+S.y);N=aa;Z=Z;d=d;h=h;O+=l*(E*(0.25*(N*N+d*N+d*d)+(0*N+0*d))+0+(E*(0.25*(Z*Z+h*Z+h*h)+(0*Z+0*h))+0))}k.mass=z*H;u*=1/H;D*=1/H;k.center.Set(u,D);k.I=z*O}};A.prototype.ComputeSubmergedArea=function(k,z,u,D){if(z===undefined)z=0;var H=B.MulTMV(u.R,k),O=z-B.Dot(k,u.position),E=new Vector_a2j_Number,R=0,N=parseInt(-1);z=
parseInt(-1);var S=false;for(k=k=0;k<this.m_vertexCount;++k){E[k]=B.Dot(H,this.m_vertices[k])-O;var aa=E[k]<-Number.MIN_VALUE;if(k>0)if(aa){if(!S){N=k-1;R++}}else if(S){z=k-1;R++}S=aa}switch(R){case 0:if(S){k=new w;this.ComputeMass(k,1);D.SetV(B.MulX(u,k.center));return k.mass}else return 0;case 1:if(N==-1)N=this.m_vertexCount-1;else z=this.m_vertexCount-1}k=parseInt((N+1)%this.m_vertexCount);H=parseInt((z+1)%this.m_vertexCount);O=(0-E[N])/(E[k]-E[N]);E=(0-E[z])/(E[H]-E[z]);N=new V(this.m_vertices[N].x*
(1-O)+this.m_vertices[k].x*O,this.m_vertices[N].y*(1-O)+this.m_vertices[k].y*O);z=new V(this.m_vertices[z].x*(1-E)+this.m_vertices[H].x*E,this.m_vertices[z].y*(1-E)+this.m_vertices[H].y*E);E=0;O=new V;R=this.m_vertices[k];for(k=k;k!=H;){k=(k+1)%this.m_vertexCount;S=k==H?z:this.m_vertices[k];aa=0.5*((R.x-N.x)*(S.y-N.y)-(R.y-N.y)*(S.x-N.x));E+=aa;O.x+=aa*(N.x+R.x+S.x)/3;O.y+=aa*(N.y+R.y+S.y)/3;R=S}O.Multiply(1/E);D.SetV(B.MulX(u,O));return E};A.prototype.GetVertexCount=function(){return this.m_vertexCount};
A.prototype.GetVertices=function(){return this.m_vertices};A.prototype.GetNormals=function(){return this.m_normals};A.prototype.GetSupport=function(k){for(var z=0,u=this.m_vertices[0].x*k.x+this.m_vertices[0].y*k.y,D=1;D<this.m_vertexCount;++D){var H=this.m_vertices[D].x*k.x+this.m_vertices[D].y*k.y;if(H>u){z=D;u=H}}return z};A.prototype.GetSupportVertex=function(k){for(var z=0,u=this.m_vertices[0].x*k.x+this.m_vertices[0].y*k.y,D=1;D<this.m_vertexCount;++D){var H=this.m_vertices[D].x*k.x+this.m_vertices[D].y*
k.y;if(H>u){z=D;u=H}}return this.m_vertices[z]};A.prototype.Validate=function(){return false};A.prototype.b2PolygonShape=function(){this.__super.b2Shape.call(this);this.m_type=U.e_polygonShape;this.m_centroid=new V;this.m_vertices=new Vector;this.m_normals=new Vector};A.prototype.Reserve=function(k){if(k===undefined)k=0;for(var z=parseInt(this.m_vertices.length);z<k;z++){this.m_vertices[z]=new V;this.m_normals[z]=new V}};A.ComputeCentroid=function(k,z){if(z===undefined)z=0;for(var u=new V,D=0,H=1/
3,O=0;O<z;++O){var E=k[O],R=O+1<z?k[parseInt(O+1)]:k[0],N=0.5*((E.x-0)*(R.y-0)-(E.y-0)*(R.x-0));D+=N;u.x+=N*H*(0+E.x+R.x);u.y+=N*H*(0+E.y+R.y)}u.x*=1/D;u.y*=1/D;return u};A.ComputeOBB=function(k,z,u){if(u===undefined)u=0;var D=0,H=new Vector(u+1);for(D=0;D<u;++D)H[D]=z[D];H[u]=H[0];z=Number.MAX_VALUE;for(D=1;D<=u;++D){var O=H[parseInt(D-1)],E=H[D].x-O.x,R=H[D].y-O.y,N=Math.sqrt(E*E+R*R);E/=N;R/=N;for(var S=-R,aa=E,Z=N=Number.MAX_VALUE,d=-Number.MAX_VALUE,h=-Number.MAX_VALUE,l=0;l<u;++l){var j=H[l].x-
O.x,o=H[l].y-O.y,q=E*j+R*o;j=S*j+aa*o;if(q<N)N=q;if(j<Z)Z=j;if(q>d)d=q;if(j>h)h=j}l=(d-N)*(h-Z);if(l<0.95*z){z=l;k.R.col1.x=E;k.R.col1.y=R;k.R.col2.x=S;k.R.col2.y=aa;E=0.5*(N+d);R=0.5*(Z+h);S=k.R;k.center.x=O.x+(S.col1.x*E+S.col2.x*R);k.center.y=O.y+(S.col1.y*E+S.col2.y*R);k.extents.x=0.5*(d-N);k.extents.y=0.5*(h-Z)}}};Box2D.postDefs.push(function(){Box2D.Collision.Shapes.b2PolygonShape.s_mat=new p});U.b2Shape=function(){};U.prototype.Copy=function(){return null};U.prototype.Set=function(k){this.m_radius=
k.m_radius};U.prototype.GetType=function(){return this.m_type};U.prototype.TestPoint=function(){return false};U.prototype.RayCast=function(){return false};U.prototype.ComputeAABB=function(){};U.prototype.ComputeMass=function(){};U.prototype.ComputeSubmergedArea=function(){return 0};U.TestOverlap=function(k,z,u,D){var H=new L;H.proxyA=new W;H.proxyA.Set(k);H.proxyB=new W;H.proxyB.Set(u);H.transformA=z;H.transformB=D;H.useRadii=true;k=new Y;k.count=0;z=new I;M.Distance(z,k,H);return z.distance<10*Number.MIN_VALUE};
U.prototype.b2Shape=function(){this.m_type=U.e_unknownShape;this.m_radius=F.b2_linearSlop};Box2D.postDefs.push(function(){Box2D.Collision.Shapes.b2Shape.e_unknownShape=parseInt(-1);Box2D.Collision.Shapes.b2Shape.e_circleShape=0;Box2D.Collision.Shapes.b2Shape.e_polygonShape=1;Box2D.Collision.Shapes.b2Shape.e_edgeShape=2;Box2D.Collision.Shapes.b2Shape.e_shapeTypeCount=3;Box2D.Collision.Shapes.b2Shape.e_hitCollide=1;Box2D.Collision.Shapes.b2Shape.e_missCollide=0;Box2D.Collision.Shapes.b2Shape.e_startsInsideCollide=
parseInt(-1)})})();
(function(){var F=Box2D.Common.b2Color,G=Box2D.Common.b2Settings,K=Box2D.Common.Math.b2Math;F.b2Color=function(){this._b=this._g=this._r=0};F.prototype.b2Color=function(y,w,A){if(y===undefined)y=0;if(w===undefined)w=0;if(A===undefined)A=0;this._r=Box2D.parseUInt(255*K.Clamp(y,0,1));this._g=Box2D.parseUInt(255*K.Clamp(w,0,1));this._b=Box2D.parseUInt(255*K.Clamp(A,0,1))};F.prototype.Set=function(y,w,A){if(y===undefined)y=0;if(w===undefined)w=0;if(A===undefined)A=0;this._r=Box2D.parseUInt(255*K.Clamp(y,
0,1));this._g=Box2D.parseUInt(255*K.Clamp(w,0,1));this._b=Box2D.parseUInt(255*K.Clamp(A,0,1))};Object.defineProperty(F.prototype,"r",{enumerable:false,configurable:true,set:function(y){if(y===undefined)y=0;this._r=Box2D.parseUInt(255*K.Clamp(y,0,1))}});Object.defineProperty(F.prototype,"g",{enumerable:false,configurable:true,set:function(y){if(y===undefined)y=0;this._g=Box2D.parseUInt(255*K.Clamp(y,0,1))}});Object.defineProperty(F.prototype,"b",{enumerable:false,configurable:true,set:function(y){if(y===
undefined)y=0;this._b=Box2D.parseUInt(255*K.Clamp(y,0,1))}});Object.defineProperty(F.prototype,"color",{enumerable:false,configurable:true,get:function(){return this._r<<16|this._g<<8|this._b}});G.b2Settings=function(){};G.b2MixFriction=function(y,w){if(y===undefined)y=0;if(w===undefined)w=0;return Math.sqrt(y*w)};G.b2MixRestitution=function(y,w){if(y===undefined)y=0;if(w===undefined)w=0;return y>w?y:w};G.b2Assert=function(y){if(!y)throw"Assertion Failed";};Box2D.postDefs.push(function(){Box2D.Common.b2Settings.VERSION=
"2.1alpha";Box2D.Common.b2Settings.USHRT_MAX=65535;Box2D.Common.b2Settings.b2_pi=Math.PI;Box2D.Common.b2Settings.b2_maxManifoldPoints=2;Box2D.Common.b2Settings.b2_aabbExtension=0.1;Box2D.Common.b2Settings.b2_aabbMultiplier=2;Box2D.Common.b2Settings.b2_polygonRadius=2*G.b2_linearSlop;Box2D.Common.b2Settings.b2_linearSlop=0.0050;Box2D.Common.b2Settings.b2_angularSlop=2/180*G.b2_pi;Box2D.Common.b2Settings.b2_toiSlop=8*G.b2_linearSlop;Box2D.Common.b2Settings.b2_maxTOIContactsPerIsland=32;Box2D.Common.b2Settings.b2_maxTOIJointsPerIsland=
32;Box2D.Common.b2Settings.b2_velocityThreshold=1;Box2D.Common.b2Settings.b2_maxLinearCorrection=0.2;Box2D.Common.b2Settings.b2_maxAngularCorrection=8/180*G.b2_pi;Box2D.Common.b2Settings.b2_maxTranslation=2;Box2D.Common.b2Settings.b2_maxTranslationSquared=G.b2_maxTranslation*G.b2_maxTranslation;Box2D.Common.b2Settings.b2_maxRotation=0.5*G.b2_pi;Box2D.Common.b2Settings.b2_maxRotationSquared=G.b2_maxRotation*G.b2_maxRotation;Box2D.Common.b2Settings.b2_contactBaumgarte=0.2;Box2D.Common.b2Settings.b2_timeToSleep=
0.5;Box2D.Common.b2Settings.b2_linearSleepTolerance=0.01;Box2D.Common.b2Settings.b2_angularSleepTolerance=2/180*G.b2_pi})})();
(function(){var F=Box2D.Common.Math.b2Mat22,G=Box2D.Common.Math.b2Mat33,K=Box2D.Common.Math.b2Math,y=Box2D.Common.Math.b2Sweep,w=Box2D.Common.Math.b2Transform,A=Box2D.Common.Math.b2Vec2,U=Box2D.Common.Math.b2Vec3;F.b2Mat22=function(){this.col1=new A;this.col2=new A};F.prototype.b2Mat22=function(){this.SetIdentity()};F.FromAngle=function(p){if(p===undefined)p=0;var B=new F;B.Set(p);return B};F.FromVV=function(p,B){var Q=new F;Q.SetVV(p,B);return Q};F.prototype.Set=function(p){if(p===undefined)p=0;
var B=Math.cos(p);p=Math.sin(p);this.col1.x=B;this.col2.x=-p;this.col1.y=p;this.col2.y=B};F.prototype.SetVV=function(p,B){this.col1.SetV(p);this.col2.SetV(B)};F.prototype.Copy=function(){var p=new F;p.SetM(this);return p};F.prototype.SetM=function(p){this.col1.SetV(p.col1);this.col2.SetV(p.col2)};F.prototype.AddM=function(p){this.col1.x+=p.col1.x;this.col1.y+=p.col1.y;this.col2.x+=p.col2.x;this.col2.y+=p.col2.y};F.prototype.SetIdentity=function(){this.col1.x=1;this.col2.x=0;this.col1.y=0;this.col2.y=
1};F.prototype.SetZero=function(){this.col1.x=0;this.col2.x=0;this.col1.y=0;this.col2.y=0};F.prototype.GetAngle=function(){return Math.atan2(this.col1.y,this.col1.x)};F.prototype.GetInverse=function(p){var B=this.col1.x,Q=this.col2.x,V=this.col1.y,M=this.col2.y,L=B*M-Q*V;if(L!=0)L=1/L;p.col1.x=L*M;p.col2.x=-L*Q;p.col1.y=-L*V;p.col2.y=L*B;return p};F.prototype.Solve=function(p,B,Q){if(B===undefined)B=0;if(Q===undefined)Q=0;var V=this.col1.x,M=this.col2.x,L=this.col1.y,I=this.col2.y,W=V*I-M*L;if(W!=
0)W=1/W;p.x=W*(I*B-M*Q);p.y=W*(V*Q-L*B);return p};F.prototype.Abs=function(){this.col1.Abs();this.col2.Abs()};G.b2Mat33=function(){this.col1=new U;this.col2=new U;this.col3=new U};G.prototype.b2Mat33=function(p,B,Q){if(p===undefined)p=null;if(B===undefined)B=null;if(Q===undefined)Q=null;if(!p&&!B&&!Q){this.col1.SetZero();this.col2.SetZero();this.col3.SetZero()}else{this.col1.SetV(p);this.col2.SetV(B);this.col3.SetV(Q)}};G.prototype.SetVVV=function(p,B,Q){this.col1.SetV(p);this.col2.SetV(B);this.col3.SetV(Q)};
G.prototype.Copy=function(){return new G(this.col1,this.col2,this.col3)};G.prototype.SetM=function(p){this.col1.SetV(p.col1);this.col2.SetV(p.col2);this.col3.SetV(p.col3)};G.prototype.AddM=function(p){this.col1.x+=p.col1.x;this.col1.y+=p.col1.y;this.col1.z+=p.col1.z;this.col2.x+=p.col2.x;this.col2.y+=p.col2.y;this.col2.z+=p.col2.z;this.col3.x+=p.col3.x;this.col3.y+=p.col3.y;this.col3.z+=p.col3.z};G.prototype.SetIdentity=function(){this.col1.x=1;this.col2.x=0;this.col3.x=0;this.col1.y=0;this.col2.y=
1;this.col3.y=0;this.col1.z=0;this.col2.z=0;this.col3.z=1};G.prototype.SetZero=function(){this.col1.x=0;this.col2.x=0;this.col3.x=0;this.col1.y=0;this.col2.y=0;this.col3.y=0;this.col1.z=0;this.col2.z=0;this.col3.z=0};G.prototype.Solve22=function(p,B,Q){if(B===undefined)B=0;if(Q===undefined)Q=0;var V=this.col1.x,M=this.col2.x,L=this.col1.y,I=this.col2.y,W=V*I-M*L;if(W!=0)W=1/W;p.x=W*(I*B-M*Q);p.y=W*(V*Q-L*B);return p};G.prototype.Solve33=function(p,B,Q,V){if(B===undefined)B=0;if(Q===undefined)Q=0;
if(V===undefined)V=0;var M=this.col1.x,L=this.col1.y,I=this.col1.z,W=this.col2.x,Y=this.col2.y,k=this.col2.z,z=this.col3.x,u=this.col3.y,D=this.col3.z,H=M*(Y*D-k*u)+L*(k*z-W*D)+I*(W*u-Y*z);if(H!=0)H=1/H;p.x=H*(B*(Y*D-k*u)+Q*(k*z-W*D)+V*(W*u-Y*z));p.y=H*(M*(Q*D-V*u)+L*(V*z-B*D)+I*(B*u-Q*z));p.z=H*(M*(Y*V-k*Q)+L*(k*B-W*V)+I*(W*Q-Y*B));return p};K.b2Math=function(){};K.IsValid=function(p){if(p===undefined)p=0;return isFinite(p)};K.Dot=function(p,B){return p.x*B.x+p.y*B.y};K.CrossVV=function(p,B){return p.x*
B.y-p.y*B.x};K.CrossVF=function(p,B){if(B===undefined)B=0;return new A(B*p.y,-B*p.x)};K.CrossFV=function(p,B){if(p===undefined)p=0;return new A(-p*B.y,p*B.x)};K.MulMV=function(p,B){return new A(p.col1.x*B.x+p.col2.x*B.y,p.col1.y*B.x+p.col2.y*B.y)};K.MulTMV=function(p,B){return new A(K.Dot(B,p.col1),K.Dot(B,p.col2))};K.MulX=function(p,B){var Q=K.MulMV(p.R,B);Q.x+=p.position.x;Q.y+=p.position.y;return Q};K.MulXT=function(p,B){var Q=K.SubtractVV(B,p.position),V=Q.x*p.R.col1.x+Q.y*p.R.col1.y;Q.y=Q.x*
p.R.col2.x+Q.y*p.R.col2.y;Q.x=V;return Q};K.AddVV=function(p,B){return new A(p.x+B.x,p.y+B.y)};K.SubtractVV=function(p,B){return new A(p.x-B.x,p.y-B.y)};K.Distance=function(p,B){var Q=p.x-B.x,V=p.y-B.y;return Math.sqrt(Q*Q+V*V)};K.DistanceSquared=function(p,B){var Q=p.x-B.x,V=p.y-B.y;return Q*Q+V*V};K.MulFV=function(p,B){if(p===undefined)p=0;return new A(p*B.x,p*B.y)};K.AddMM=function(p,B){return F.FromVV(K.AddVV(p.col1,B.col1),K.AddVV(p.col2,B.col2))};K.MulMM=function(p,B){return F.FromVV(K.MulMV(p,
B.col1),K.MulMV(p,B.col2))};K.MulTMM=function(p,B){var Q=new A(K.Dot(p.col1,B.col1),K.Dot(p.col2,B.col1)),V=new A(K.Dot(p.col1,B.col2),K.Dot(p.col2,B.col2));return F.FromVV(Q,V)};K.Abs=function(p){if(p===undefined)p=0;return p>0?p:-p};K.AbsV=function(p){return new A(K.Abs(p.x),K.Abs(p.y))};K.AbsM=function(p){return F.FromVV(K.AbsV(p.col1),K.AbsV(p.col2))};K.Min=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;return p<B?p:B};K.MinV=function(p,B){return new A(K.Min(p.x,B.x),K.Min(p.y,B.y))};
K.Max=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;return p>B?p:B};K.MaxV=function(p,B){return new A(K.Max(p.x,B.x),K.Max(p.y,B.y))};K.Clamp=function(p,B,Q){if(p===undefined)p=0;if(B===undefined)B=0;if(Q===undefined)Q=0;return p<B?B:p>Q?Q:p};K.ClampV=function(p,B,Q){return K.MaxV(B,K.MinV(p,Q))};K.Swap=function(p,B){var Q=p[0];p[0]=B[0];B[0]=Q};K.Random=function(){return Math.random()*2-1};K.RandomRange=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;var Q=Math.random();return Q=
(B-p)*Q+p};K.NextPowerOfTwo=function(p){if(p===undefined)p=0;p|=p>>1&2147483647;p|=p>>2&1073741823;p|=p>>4&268435455;p|=p>>8&16777215;p|=p>>16&65535;return p+1};K.IsPowerOfTwo=function(p){if(p===undefined)p=0;return p>0&&(p&p-1)==0};Box2D.postDefs.push(function(){Box2D.Common.Math.b2Math.b2Vec2_zero=new A(0,0);Box2D.Common.Math.b2Math.b2Mat22_identity=F.FromVV(new A(1,0),new A(0,1));Box2D.Common.Math.b2Math.b2Transform_identity=new w(K.b2Vec2_zero,K.b2Mat22_identity)});y.b2Sweep=function(){this.localCenter=
new A;this.c0=new A;this.c=new A};y.prototype.Set=function(p){this.localCenter.SetV(p.localCenter);this.c0.SetV(p.c0);this.c.SetV(p.c);this.a0=p.a0;this.a=p.a;this.t0=p.t0};y.prototype.Copy=function(){var p=new y;p.localCenter.SetV(this.localCenter);p.c0.SetV(this.c0);p.c.SetV(this.c);p.a0=this.a0;p.a=this.a;p.t0=this.t0;return p};y.prototype.GetTransform=function(p,B){if(B===undefined)B=0;p.position.x=(1-B)*this.c0.x+B*this.c.x;p.position.y=(1-B)*this.c0.y+B*this.c.y;p.R.Set((1-B)*this.a0+B*this.a);
var Q=p.R;p.position.x-=Q.col1.x*this.localCenter.x+Q.col2.x*this.localCenter.y;p.position.y-=Q.col1.y*this.localCenter.x+Q.col2.y*this.localCenter.y};y.prototype.Advance=function(p){if(p===undefined)p=0;if(this.t0<p&&1-this.t0>Number.MIN_VALUE){var B=(p-this.t0)/(1-this.t0);this.c0.x=(1-B)*this.c0.x+B*this.c.x;this.c0.y=(1-B)*this.c0.y+B*this.c.y;this.a0=(1-B)*this.a0+B*this.a;this.t0=p}};w.b2Transform=function(){this.position=new A;this.R=new F};w.prototype.b2Transform=function(p,B){if(p===undefined)p=
null;if(B===undefined)B=null;if(p){this.position.SetV(p);this.R.SetM(B)}};w.prototype.Initialize=function(p,B){this.position.SetV(p);this.R.SetM(B)};w.prototype.SetIdentity=function(){this.position.SetZero();this.R.SetIdentity()};w.prototype.Set=function(p){this.position.SetV(p.position);this.R.SetM(p.R)};w.prototype.GetAngle=function(){return Math.atan2(this.R.col1.y,this.R.col1.x)};A.b2Vec2=function(){};A.prototype.b2Vec2=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;this.x=p;this.y=B};
A.prototype.SetZero=function(){this.y=this.x=0};A.prototype.Set=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;this.x=p;this.y=B};A.prototype.SetV=function(p){this.x=p.x;this.y=p.y};A.prototype.GetNegative=function(){return new A(-this.x,-this.y)};A.prototype.NegativeSelf=function(){this.x=-this.x;this.y=-this.y};A.Make=function(p,B){if(p===undefined)p=0;if(B===undefined)B=0;return new A(p,B)};A.prototype.Copy=function(){return new A(this.x,this.y)};A.prototype.Add=function(p){this.x+=p.x;
this.y+=p.y};A.prototype.Subtract=function(p){this.x-=p.x;this.y-=p.y};A.prototype.Multiply=function(p){if(p===undefined)p=0;this.x*=p;this.y*=p};A.prototype.MulM=function(p){var B=this.x;this.x=p.col1.x*B+p.col2.x*this.y;this.y=p.col1.y*B+p.col2.y*this.y};A.prototype.MulTM=function(p){var B=K.Dot(this,p.col1);this.y=K.Dot(this,p.col2);this.x=B};A.prototype.CrossVF=function(p){if(p===undefined)p=0;var B=this.x;this.x=p*this.y;this.y=-p*B};A.prototype.CrossFV=function(p){if(p===undefined)p=0;var B=
this.x;this.x=-p*this.y;this.y=p*B};A.prototype.MinV=function(p){this.x=this.x<p.x?this.x:p.x;this.y=this.y<p.y?this.y:p.y};A.prototype.MaxV=function(p){this.x=this.x>p.x?this.x:p.x;this.y=this.y>p.y?this.y:p.y};A.prototype.Abs=function(){if(this.x<0)this.x=-this.x;if(this.y<0)this.y=-this.y};A.prototype.Length=function(){return Math.sqrt(this.x*this.x+this.y*this.y)};A.prototype.LengthSquared=function(){return this.x*this.x+this.y*this.y};A.prototype.Normalize=function(){var p=Math.sqrt(this.x*this.x+
this.y*this.y);if(p<Number.MIN_VALUE)return 0;var B=1/p;this.x*=B;this.y*=B;return p};A.prototype.IsValid=function(){return K.IsValid(this.x)&&K.IsValid(this.y)};U.b2Vec3=function(){};U.prototype.b2Vec3=function(p,B,Q){if(p===undefined)p=0;if(B===undefined)B=0;if(Q===undefined)Q=0;this.x=p;this.y=B;this.z=Q};U.prototype.SetZero=function(){this.x=this.y=this.z=0};U.prototype.Set=function(p,B,Q){if(p===undefined)p=0;if(B===undefined)B=0;if(Q===undefined)Q=0;this.x=p;this.y=B;this.z=Q};U.prototype.SetV=
function(p){this.x=p.x;this.y=p.y;this.z=p.z};U.prototype.GetNegative=function(){return new U(-this.x,-this.y,-this.z)};U.prototype.NegativeSelf=function(){this.x=-this.x;this.y=-this.y;this.z=-this.z};U.prototype.Copy=function(){return new U(this.x,this.y,this.z)};U.prototype.Add=function(p){this.x+=p.x;this.y+=p.y;this.z+=p.z};U.prototype.Subtract=function(p){this.x-=p.x;this.y-=p.y;this.z-=p.z};U.prototype.Multiply=function(p){if(p===undefined)p=0;this.x*=p;this.y*=p;this.z*=p}})();
(function(){var F=Box2D.Common.Math.b2Math,G=Box2D.Common.Math.b2Sweep,K=Box2D.Common.Math.b2Transform,y=Box2D.Common.Math.b2Vec2,w=Box2D.Common.b2Color,A=Box2D.Common.b2Settings,U=Box2D.Collision.b2AABB,p=Box2D.Collision.b2ContactPoint,B=Box2D.Collision.b2DynamicTreeBroadPhase,Q=Box2D.Collision.b2RayCastInput,V=Box2D.Collision.b2RayCastOutput,M=Box2D.Collision.Shapes.b2CircleShape,L=Box2D.Collision.Shapes.b2EdgeShape,I=Box2D.Collision.Shapes.b2MassData,W=Box2D.Collision.Shapes.b2PolygonShape,Y=Box2D.Collision.Shapes.b2Shape,
k=Box2D.Dynamics.b2Body,z=Box2D.Dynamics.b2BodyDef,u=Box2D.Dynamics.b2ContactFilter,D=Box2D.Dynamics.b2ContactImpulse,H=Box2D.Dynamics.b2ContactListener,O=Box2D.Dynamics.b2ContactManager,E=Box2D.Dynamics.b2DebugDraw,R=Box2D.Dynamics.b2DestructionListener,N=Box2D.Dynamics.b2FilterData,S=Box2D.Dynamics.b2Fixture,aa=Box2D.Dynamics.b2FixtureDef,Z=Box2D.Dynamics.b2Island,d=Box2D.Dynamics.b2TimeStep,h=Box2D.Dynamics.b2World,l=Box2D.Dynamics.Contacts.b2Contact,j=Box2D.Dynamics.Contacts.b2ContactFactory,
o=Box2D.Dynamics.Contacts.b2ContactSolver,q=Box2D.Dynamics.Joints.b2Joint,n=Box2D.Dynamics.Joints.b2PulleyJoint;k.b2Body=function(){this.m_xf=new K;this.m_sweep=new G;this.m_linearVelocity=new y;this.m_force=new y};k.prototype.connectEdges=function(a,c,g){if(g===undefined)g=0;var b=Math.atan2(c.GetDirectionVector().y,c.GetDirectionVector().x);g=F.MulFV(Math.tan((b-g)*0.5),c.GetDirectionVector());g=F.SubtractVV(g,c.GetNormalVector());g=F.MulFV(A.b2_toiSlop,g);g=F.AddVV(g,c.GetVertex1());var e=F.AddVV(a.GetDirectionVector(),
c.GetDirectionVector());e.Normalize();var f=F.Dot(a.GetDirectionVector(),c.GetNormalVector())>0;a.SetNextEdge(c,g,e,f);c.SetPrevEdge(a,g,e,f);return b};k.prototype.CreateFixture=function(a){if(this.m_world.IsLocked()==true)return null;var c=new S;c.Create(this,this.m_xf,a);this.m_flags&k.e_activeFlag&&c.CreateProxy(this.m_world.m_contactManager.m_broadPhase,this.m_xf);c.m_next=this.m_fixtureList;this.m_fixtureList=c;++this.m_fixtureCount;c.m_body=this;c.m_density>0&&this.ResetMassData();this.m_world.m_flags|=
h.e_newFixture;return c};k.prototype.CreateFixture2=function(a,c){if(c===undefined)c=0;var g=new aa;g.shape=a;g.density=c;return this.CreateFixture(g)};k.prototype.DestroyFixture=function(a){if(this.m_world.IsLocked()!=true){for(var c=this.m_fixtureList,g=null;c!=null;){if(c==a){if(g)g.m_next=a.m_next;else this.m_fixtureList=a.m_next;break}g=c;c=c.m_next}for(c=this.m_contactList;c;){g=c.contact;c=c.next;var b=g.GetFixtureA(),e=g.GetFixtureB();if(a==b||a==e)this.m_world.m_contactManager.Destroy(g)}this.m_flags&
k.e_activeFlag&&a.DestroyProxy(this.m_world.m_contactManager.m_broadPhase);a.Destroy();a.m_body=null;a.m_next=null;--this.m_fixtureCount;this.ResetMassData()}};k.prototype.SetPositionAndAngle=function(a,c){if(c===undefined)c=0;var g;if(this.m_world.IsLocked()!=true){this.m_xf.R.Set(c);this.m_xf.position.SetV(a);g=this.m_xf.R;var b=this.m_sweep.localCenter;this.m_sweep.c.x=g.col1.x*b.x+g.col2.x*b.y;this.m_sweep.c.y=g.col1.y*b.x+g.col2.y*b.y;this.m_sweep.c.x+=this.m_xf.position.x;this.m_sweep.c.y+=
this.m_xf.position.y;this.m_sweep.c0.SetV(this.m_sweep.c);this.m_sweep.a0=this.m_sweep.a=c;b=this.m_world.m_contactManager.m_broadPhase;for(g=this.m_fixtureList;g;g=g.m_next)g.Synchronize(b,this.m_xf,this.m_xf);this.m_world.m_contactManager.FindNewContacts()}};k.prototype.SetTransform=function(a){this.SetPositionAndAngle(a.position,a.GetAngle())};k.prototype.GetTransform=function(){return this.m_xf};k.prototype.GetPosition=function(){return this.m_xf.position};k.prototype.SetPosition=function(a){this.SetPositionAndAngle(a,
this.GetAngle())};k.prototype.GetAngle=function(){return this.m_sweep.a};k.prototype.SetAngle=function(a){if(a===undefined)a=0;this.SetPositionAndAngle(this.GetPosition(),a)};k.prototype.GetWorldCenter=function(){return this.m_sweep.c};k.prototype.GetLocalCenter=function(){return this.m_sweep.localCenter};k.prototype.SetLinearVelocity=function(a){this.m_type!=k.b2_staticBody&&this.m_linearVelocity.SetV(a)};k.prototype.GetLinearVelocity=function(){return this.m_linearVelocity};k.prototype.SetAngularVelocity=
function(a){if(a===undefined)a=0;if(this.m_type!=k.b2_staticBody)this.m_angularVelocity=a};k.prototype.GetAngularVelocity=function(){return this.m_angularVelocity};k.prototype.GetDefinition=function(){var a=new z;a.type=this.GetType();a.allowSleep=(this.m_flags&k.e_allowSleepFlag)==k.e_allowSleepFlag;a.angle=this.GetAngle();a.angularDamping=this.m_angularDamping;a.angularVelocity=this.m_angularVelocity;a.fixedRotation=(this.m_flags&k.e_fixedRotationFlag)==k.e_fixedRotationFlag;a.bullet=(this.m_flags&
k.e_bulletFlag)==k.e_bulletFlag;a.awake=(this.m_flags&k.e_awakeFlag)==k.e_awakeFlag;a.linearDamping=this.m_linearDamping;a.linearVelocity.SetV(this.GetLinearVelocity());a.position=this.GetPosition();a.userData=this.GetUserData();return a};k.prototype.ApplyForce=function(a,c){if(this.m_type==k.b2_dynamicBody){this.IsAwake()==false&&this.SetAwake(true);this.m_force.x+=a.x;this.m_force.y+=a.y;this.m_torque+=(c.x-this.m_sweep.c.x)*a.y-(c.y-this.m_sweep.c.y)*a.x}};k.prototype.ApplyTorque=function(a){if(a===
undefined)a=0;if(this.m_type==k.b2_dynamicBody){this.IsAwake()==false&&this.SetAwake(true);this.m_torque+=a}};k.prototype.ApplyImpulse=function(a,c){if(this.m_type==k.b2_dynamicBody){this.IsAwake()==false&&this.SetAwake(true);this.m_linearVelocity.x+=this.m_invMass*a.x;this.m_linearVelocity.y+=this.m_invMass*a.y;this.m_angularVelocity+=this.m_invI*((c.x-this.m_sweep.c.x)*a.y-(c.y-this.m_sweep.c.y)*a.x)}};k.prototype.Split=function(a){for(var c=this.GetLinearVelocity().Copy(),g=this.GetAngularVelocity(),
b=this.GetWorldCenter(),e=this.m_world.CreateBody(this.GetDefinition()),f,m=this.m_fixtureList;m;)if(a(m)){var r=m.m_next;if(f)f.m_next=r;else this.m_fixtureList=r;this.m_fixtureCount--;m.m_next=e.m_fixtureList;e.m_fixtureList=m;e.m_fixtureCount++;m.m_body=e;m=r}else{f=m;m=m.m_next}this.ResetMassData();e.ResetMassData();f=this.GetWorldCenter();a=e.GetWorldCenter();f=F.AddVV(c,F.CrossFV(g,F.SubtractVV(f,b)));c=F.AddVV(c,F.CrossFV(g,F.SubtractVV(a,b)));this.SetLinearVelocity(f);e.SetLinearVelocity(c);
this.SetAngularVelocity(g);e.SetAngularVelocity(g);this.SynchronizeFixtures();e.SynchronizeFixtures();return e};k.prototype.Merge=function(a){var c;for(c=a.m_fixtureList;c;){var g=c.m_next;a.m_fixtureCount--;c.m_next=this.m_fixtureList;this.m_fixtureList=c;this.m_fixtureCount++;c.m_body=e;c=g}b.m_fixtureCount=0;var b=this,e=a;b.GetWorldCenter();e.GetWorldCenter();b.GetLinearVelocity().Copy();e.GetLinearVelocity().Copy();b.GetAngularVelocity();e.GetAngularVelocity();b.ResetMassData();this.SynchronizeFixtures()};
k.prototype.GetMass=function(){return this.m_mass};k.prototype.GetInertia=function(){return this.m_I};k.prototype.GetMassData=function(a){a.mass=this.m_mass;a.I=this.m_I;a.center.SetV(this.m_sweep.localCenter)};k.prototype.SetMassData=function(a){A.b2Assert(this.m_world.IsLocked()==false);if(this.m_world.IsLocked()!=true)if(this.m_type==k.b2_dynamicBody){this.m_invI=this.m_I=this.m_invMass=0;this.m_mass=a.mass;if(this.m_mass<=0)this.m_mass=1;this.m_invMass=1/this.m_mass;if(a.I>0&&(this.m_flags&k.e_fixedRotationFlag)==
0){this.m_I=a.I-this.m_mass*(a.center.x*a.center.x+a.center.y*a.center.y);this.m_invI=1/this.m_I}var c=this.m_sweep.c.Copy();this.m_sweep.localCenter.SetV(a.center);this.m_sweep.c0.SetV(F.MulX(this.m_xf,this.m_sweep.localCenter));this.m_sweep.c.SetV(this.m_sweep.c0);this.m_linearVelocity.x+=this.m_angularVelocity*-(this.m_sweep.c.y-c.y);this.m_linearVelocity.y+=this.m_angularVelocity*+(this.m_sweep.c.x-c.x)}};k.prototype.ResetMassData=function(){this.m_invI=this.m_I=this.m_invMass=this.m_mass=0;this.m_sweep.localCenter.SetZero();
if(!(this.m_type==k.b2_staticBody||this.m_type==k.b2_kinematicBody)){for(var a=y.Make(0,0),c=this.m_fixtureList;c;c=c.m_next)if(c.m_density!=0){var g=c.GetMassData();this.m_mass+=g.mass;a.x+=g.center.x*g.mass;a.y+=g.center.y*g.mass;this.m_I+=g.I}if(this.m_mass>0){this.m_invMass=1/this.m_mass;a.x*=this.m_invMass;a.y*=this.m_invMass}else this.m_invMass=this.m_mass=1;if(this.m_I>0&&(this.m_flags&k.e_fixedRotationFlag)==0){this.m_I-=this.m_mass*(a.x*a.x+a.y*a.y);this.m_I*=this.m_inertiaScale;A.b2Assert(this.m_I>
0);this.m_invI=1/this.m_I}else this.m_invI=this.m_I=0;c=this.m_sweep.c.Copy();this.m_sweep.localCenter.SetV(a);this.m_sweep.c0.SetV(F.MulX(this.m_xf,this.m_sweep.localCenter));this.m_sweep.c.SetV(this.m_sweep.c0);this.m_linearVelocity.x+=this.m_angularVelocity*-(this.m_sweep.c.y-c.y);this.m_linearVelocity.y+=this.m_angularVelocity*+(this.m_sweep.c.x-c.x)}};k.prototype.GetWorldPoint=function(a){var c=this.m_xf.R;a=new y(c.col1.x*a.x+c.col2.x*a.y,c.col1.y*a.x+c.col2.y*a.y);a.x+=this.m_xf.position.x;
a.y+=this.m_xf.position.y;return a};k.prototype.GetWorldVector=function(a){return F.MulMV(this.m_xf.R,a)};k.prototype.GetLocalPoint=function(a){return F.MulXT(this.m_xf,a)};k.prototype.GetLocalVector=function(a){return F.MulTMV(this.m_xf.R,a)};k.prototype.GetLinearVelocityFromWorldPoint=function(a){return new y(this.m_linearVelocity.x-this.m_angularVelocity*(a.y-this.m_sweep.c.y),this.m_linearVelocity.y+this.m_angularVelocity*(a.x-this.m_sweep.c.x))};k.prototype.GetLinearVelocityFromLocalPoint=function(a){var c=
this.m_xf.R;a=new y(c.col1.x*a.x+c.col2.x*a.y,c.col1.y*a.x+c.col2.y*a.y);a.x+=this.m_xf.position.x;a.y+=this.m_xf.position.y;return new y(this.m_linearVelocity.x-this.m_angularVelocity*(a.y-this.m_sweep.c.y),this.m_linearVelocity.y+this.m_angularVelocity*(a.x-this.m_sweep.c.x))};k.prototype.GetLinearDamping=function(){return this.m_linearDamping};k.prototype.SetLinearDamping=function(a){if(a===undefined)a=0;this.m_linearDamping=a};k.prototype.GetAngularDamping=function(){return this.m_angularDamping};
k.prototype.SetAngularDamping=function(a){if(a===undefined)a=0;this.m_angularDamping=a};k.prototype.SetType=function(a){if(a===undefined)a=0;if(this.m_type!=a){this.m_type=a;this.ResetMassData();if(this.m_type==k.b2_staticBody){this.m_linearVelocity.SetZero();this.m_angularVelocity=0}this.SetAwake(true);this.m_force.SetZero();this.m_torque=0;for(a=this.m_contactList;a;a=a.next)a.contact.FlagForFiltering()}};k.prototype.GetType=function(){return this.m_type};k.prototype.SetBullet=function(a){if(a)this.m_flags|=
k.e_bulletFlag;else this.m_flags&=~k.e_bulletFlag};k.prototype.IsBullet=function(){return(this.m_flags&k.e_bulletFlag)==k.e_bulletFlag};k.prototype.SetSleepingAllowed=function(a){if(a)this.m_flags|=k.e_allowSleepFlag;else{this.m_flags&=~k.e_allowSleepFlag;this.SetAwake(true)}};k.prototype.SetAwake=function(a){if(a){this.m_flags|=k.e_awakeFlag;this.m_sleepTime=0}else{this.m_flags&=~k.e_awakeFlag;this.m_sleepTime=0;this.m_linearVelocity.SetZero();this.m_angularVelocity=0;this.m_force.SetZero();this.m_torque=
0}};k.prototype.IsAwake=function(){return(this.m_flags&k.e_awakeFlag)==k.e_awakeFlag};k.prototype.SetFixedRotation=function(a){if(a)this.m_flags|=k.e_fixedRotationFlag;else this.m_flags&=~k.e_fixedRotationFlag;this.ResetMassData()};k.prototype.IsFixedRotation=function(){return(this.m_flags&k.e_fixedRotationFlag)==k.e_fixedRotationFlag};k.prototype.SetActive=function(a){if(a!=this.IsActive()){var c;if(a){this.m_flags|=k.e_activeFlag;a=this.m_world.m_contactManager.m_broadPhase;for(c=this.m_fixtureList;c;c=
c.m_next)c.CreateProxy(a,this.m_xf)}else{this.m_flags&=~k.e_activeFlag;a=this.m_world.m_contactManager.m_broadPhase;for(c=this.m_fixtureList;c;c=c.m_next)c.DestroyProxy(a);for(a=this.m_contactList;a;){c=a;a=a.next;this.m_world.m_contactManager.Destroy(c.contact)}this.m_contactList=null}}};k.prototype.IsActive=function(){return(this.m_flags&k.e_activeFlag)==k.e_activeFlag};k.prototype.IsSleepingAllowed=function(){return(this.m_flags&k.e_allowSleepFlag)==k.e_allowSleepFlag};k.prototype.GetFixtureList=
function(){return this.m_fixtureList};k.prototype.GetJointList=function(){return this.m_jointList};k.prototype.GetControllerList=function(){return this.m_controllerList};k.prototype.GetContactList=function(){return this.m_contactList};k.prototype.GetNext=function(){return this.m_next};k.prototype.GetUserData=function(){return this.m_userData};k.prototype.SetUserData=function(a){this.m_userData=a};k.prototype.GetWorld=function(){return this.m_world};k.prototype.b2Body=function(a,c){this.m_flags=0;
if(a.bullet)this.m_flags|=k.e_bulletFlag;if(a.fixedRotation)this.m_flags|=k.e_fixedRotationFlag;if(a.allowSleep)this.m_flags|=k.e_allowSleepFlag;if(a.awake)this.m_flags|=k.e_awakeFlag;if(a.active)this.m_flags|=k.e_activeFlag;this.m_world=c;this.m_xf.position.SetV(a.position);this.m_xf.R.Set(a.angle);this.m_sweep.localCenter.SetZero();this.m_sweep.t0=1;this.m_sweep.a0=this.m_sweep.a=a.angle;var g=this.m_xf.R,b=this.m_sweep.localCenter;this.m_sweep.c.x=g.col1.x*b.x+g.col2.x*b.y;this.m_sweep.c.y=g.col1.y*
b.x+g.col2.y*b.y;this.m_sweep.c.x+=this.m_xf.position.x;this.m_sweep.c.y+=this.m_xf.position.y;this.m_sweep.c0.SetV(this.m_sweep.c);this.m_contactList=this.m_controllerList=this.m_jointList=null;this.m_controllerCount=0;this.m_next=this.m_prev=null;this.m_linearVelocity.SetV(a.linearVelocity);this.m_angularVelocity=a.angularVelocity;this.m_linearDamping=a.linearDamping;this.m_angularDamping=a.angularDamping;this.m_force.Set(0,0);this.m_sleepTime=this.m_torque=0;this.m_type=a.type;if(this.m_type==
k.b2_dynamicBody)this.m_invMass=this.m_mass=1;else this.m_invMass=this.m_mass=0;this.m_invI=this.m_I=0;this.m_inertiaScale=a.inertiaScale;this.m_userData=a.userData;this.m_fixtureList=null;this.m_fixtureCount=0};k.prototype.SynchronizeFixtures=function(){var a=k.s_xf1;a.R.Set(this.m_sweep.a0);var c=a.R,g=this.m_sweep.localCenter;a.position.x=this.m_sweep.c0.x-(c.col1.x*g.x+c.col2.x*g.y);a.position.y=this.m_sweep.c0.y-(c.col1.y*g.x+c.col2.y*g.y);g=this.m_world.m_contactManager.m_broadPhase;for(c=this.m_fixtureList;c;c=
c.m_next)c.Synchronize(g,a,this.m_xf)};k.prototype.SynchronizeTransform=function(){this.m_xf.R.Set(this.m_sweep.a);var a=this.m_xf.R,c=this.m_sweep.localCenter;this.m_xf.position.x=this.m_sweep.c.x-(a.col1.x*c.x+a.col2.x*c.y);this.m_xf.position.y=this.m_sweep.c.y-(a.col1.y*c.x+a.col2.y*c.y)};k.prototype.ShouldCollide=function(a){if(this.m_type!=k.b2_dynamicBody&&a.m_type!=k.b2_dynamicBody)return false;for(var c=this.m_jointList;c;c=c.next)if(c.other==a)if(c.joint.m_collideConnected==false)return false;
return true};k.prototype.Advance=function(a){if(a===undefined)a=0;this.m_sweep.Advance(a);this.m_sweep.c.SetV(this.m_sweep.c0);this.m_sweep.a=this.m_sweep.a0;this.SynchronizeTransform()};Box2D.postDefs.push(function(){Box2D.Dynamics.b2Body.s_xf1=new K;Box2D.Dynamics.b2Body.e_islandFlag=1;Box2D.Dynamics.b2Body.e_awakeFlag=2;Box2D.Dynamics.b2Body.e_allowSleepFlag=4;Box2D.Dynamics.b2Body.e_bulletFlag=8;Box2D.Dynamics.b2Body.e_fixedRotationFlag=16;Box2D.Dynamics.b2Body.e_activeFlag=32;Box2D.Dynamics.b2Body.b2_staticBody=
0;Box2D.Dynamics.b2Body.b2_kinematicBody=1;Box2D.Dynamics.b2Body.b2_dynamicBody=2});z.b2BodyDef=function(){this.position=new y;this.linearVelocity=new y};z.prototype.b2BodyDef=function(){this.userData=null;this.position.Set(0,0);this.angle=0;this.linearVelocity.Set(0,0);this.angularDamping=this.linearDamping=this.angularVelocity=0;this.awake=this.allowSleep=true;this.bullet=this.fixedRotation=false;this.type=k.b2_staticBody;this.active=true;this.inertiaScale=1};u.b2ContactFilter=function(){};u.prototype.ShouldCollide=
function(a,c){var g=a.GetFilterData(),b=c.GetFilterData();if(g.groupIndex==b.groupIndex&&g.groupIndex!=0)return g.groupIndex>0;return(g.maskBits&b.categoryBits)!=0&&(g.categoryBits&b.maskBits)!=0};u.prototype.RayCollide=function(a,c){if(!a)return true;return this.ShouldCollide(a instanceof S?a:null,c)};Box2D.postDefs.push(function(){Box2D.Dynamics.b2ContactFilter.b2_defaultFilter=new u});D.b2ContactImpulse=function(){this.normalImpulses=new Vector_a2j_Number(A.b2_maxManifoldPoints);this.tangentImpulses=
new Vector_a2j_Number(A.b2_maxManifoldPoints)};H.b2ContactListener=function(){};H.prototype.BeginContact=function(){};H.prototype.EndContact=function(){};H.prototype.PreSolve=function(){};H.prototype.PostSolve=function(){};Box2D.postDefs.push(function(){Box2D.Dynamics.b2ContactListener.b2_defaultListener=new H});O.b2ContactManager=function(){};O.prototype.b2ContactManager=function(){this.m_world=null;this.m_contactCount=0;this.m_contactFilter=u.b2_defaultFilter;this.m_contactListener=H.b2_defaultListener;
this.m_contactFactory=new j(this.m_allocator);this.m_broadPhase=new B};O.prototype.AddPair=function(a,c){var g=a instanceof S?a:null,b=c instanceof S?c:null,e=g.GetBody(),f=b.GetBody();if(e!=f){for(var m=f.GetContactList();m;){if(m.other==e){var r=m.contact.GetFixtureA(),s=m.contact.GetFixtureB();if(r==g&&s==b)return;if(r==b&&s==g)return}m=m.next}if(f.ShouldCollide(e)!=false)if(this.m_contactFilter.ShouldCollide(g,b)!=false){m=this.m_contactFactory.Create(g,b);g=m.GetFixtureA();b=m.GetFixtureB();
e=g.m_body;f=b.m_body;m.m_prev=null;m.m_next=this.m_world.m_contactList;if(this.m_world.m_contactList!=null)this.m_world.m_contactList.m_prev=m;this.m_world.m_contactList=m;m.m_nodeA.contact=m;m.m_nodeA.other=f;m.m_nodeA.prev=null;m.m_nodeA.next=e.m_contactList;if(e.m_contactList!=null)e.m_contactList.prev=m.m_nodeA;e.m_contactList=m.m_nodeA;m.m_nodeB.contact=m;m.m_nodeB.other=e;m.m_nodeB.prev=null;m.m_nodeB.next=f.m_contactList;if(f.m_contactList!=null)f.m_contactList.prev=m.m_nodeB;f.m_contactList=
m.m_nodeB;++this.m_world.m_contactCount}}};O.prototype.FindNewContacts=function(){this.m_broadPhase.UpdatePairs(Box2D.generateCallback(this,this.AddPair))};O.prototype.Destroy=function(a){var c=a.GetFixtureA(),g=a.GetFixtureB();c=c.GetBody();g=g.GetBody();a.IsTouching()&&this.m_contactListener.EndContact(a);if(a.m_prev)a.m_prev.m_next=a.m_next;if(a.m_next)a.m_next.m_prev=a.m_prev;if(a==this.m_world.m_contactList)this.m_world.m_contactList=a.m_next;if(a.m_nodeA.prev)a.m_nodeA.prev.next=a.m_nodeA.next;
if(a.m_nodeA.next)a.m_nodeA.next.prev=a.m_nodeA.prev;if(a.m_nodeA==c.m_contactList)c.m_contactList=a.m_nodeA.next;if(a.m_nodeB.prev)a.m_nodeB.prev.next=a.m_nodeB.next;if(a.m_nodeB.next)a.m_nodeB.next.prev=a.m_nodeB.prev;if(a.m_nodeB==g.m_contactList)g.m_contactList=a.m_nodeB.next;this.m_contactFactory.Destroy(a);--this.m_contactCount};O.prototype.Collide=function(){for(var a=this.m_world.m_contactList;a;){var c=a.GetFixtureA(),g=a.GetFixtureB(),b=c.GetBody(),e=g.GetBody();if(b.IsAwake()==false&&e.IsAwake()==
false)a=a.GetNext();else{if(a.m_flags&l.e_filterFlag){if(e.ShouldCollide(b)==false){c=a;a=c.GetNext();this.Destroy(c);continue}if(this.m_contactFilter.ShouldCollide(c,g)==false){c=a;a=c.GetNext();this.Destroy(c);continue}a.m_flags&=~l.e_filterFlag}if(this.m_broadPhase.TestOverlap(c.m_proxy,g.m_proxy)==false){c=a;a=c.GetNext();this.Destroy(c)}else{a.Update(this.m_contactListener);a=a.GetNext()}}}};Box2D.postDefs.push(function(){Box2D.Dynamics.b2ContactManager.s_evalCP=new p});E.b2DebugDraw=function(){};
E.prototype.b2DebugDraw=function(){};E.prototype.SetFlags=function(){};E.prototype.GetFlags=function(){};E.prototype.AppendFlags=function(){};E.prototype.ClearFlags=function(){};E.prototype.SetSprite=function(){};E.prototype.GetSprite=function(){};E.prototype.SetDrawScale=function(){};E.prototype.GetDrawScale=function(){};E.prototype.SetLineThickness=function(){};E.prototype.GetLineThickness=function(){};E.prototype.SetAlpha=function(){};E.prototype.GetAlpha=function(){};E.prototype.SetFillAlpha=
function(){};E.prototype.GetFillAlpha=function(){};E.prototype.SetXFormScale=function(){};E.prototype.GetXFormScale=function(){};E.prototype.DrawPolygon=function(){};E.prototype.DrawSolidPolygon=function(){};E.prototype.DrawCircle=function(){};E.prototype.DrawSolidCircle=function(){};E.prototype.DrawSegment=function(){};E.prototype.DrawTransform=function(){};Box2D.postDefs.push(function(){Box2D.Dynamics.b2DebugDraw.e_shapeBit=1;Box2D.Dynamics.b2DebugDraw.e_jointBit=2;Box2D.Dynamics.b2DebugDraw.e_aabbBit=
4;Box2D.Dynamics.b2DebugDraw.e_pairBit=8;Box2D.Dynamics.b2DebugDraw.e_centerOfMassBit=16;Box2D.Dynamics.b2DebugDraw.e_controllerBit=32});R.b2DestructionListener=function(){};R.prototype.SayGoodbyeJoint=function(){};R.prototype.SayGoodbyeFixture=function(){};N.b2FilterData=function(){this.categoryBits=1;this.maskBits=65535;this.groupIndex=0};N.prototype.Copy=function(){var a=new N;a.categoryBits=this.categoryBits;a.maskBits=this.maskBits;a.groupIndex=this.groupIndex;return a};S.b2Fixture=function(){this.m_filter=
new N};S.prototype.GetType=function(){return this.m_shape.GetType()};S.prototype.GetShape=function(){return this.m_shape};S.prototype.SetSensor=function(a){if(this.m_isSensor!=a){this.m_isSensor=a;if(this.m_body!=null)for(a=this.m_body.GetContactList();a;){var c=a.contact,g=c.GetFixtureA(),b=c.GetFixtureB();if(g==this||b==this)c.SetSensor(g.IsSensor()||b.IsSensor());a=a.next}}};S.prototype.IsSensor=function(){return this.m_isSensor};S.prototype.SetFilterData=function(a){this.m_filter=a.Copy();if(!this.m_body)for(a=
this.m_body.GetContactList();a;){var c=a.contact,g=c.GetFixtureA(),b=c.GetFixtureB();if(g==this||b==this)c.FlagForFiltering();a=a.next}};S.prototype.GetFilterData=function(){return this.m_filter.Copy()};S.prototype.GetBody=function(){return this.m_body};S.prototype.GetNext=function(){return this.m_next};S.prototype.GetUserData=function(){return this.m_userData};S.prototype.SetUserData=function(a){this.m_userData=a};S.prototype.TestPoint=function(a){return this.m_shape.TestPoint(this.m_body.GetTransform(),
a)};S.prototype.RayCast=function(a,c){return this.m_shape.RayCast(a,c,this.m_body.GetTransform())};S.prototype.GetMassData=function(a){if(a===undefined)a=null;if(a==null)a=new I;this.m_shape.ComputeMass(a,this.m_density);return a};S.prototype.SetDensity=function(a){if(a===undefined)a=0;this.m_density=a};S.prototype.GetDensity=function(){return this.m_density};S.prototype.GetFriction=function(){return this.m_friction};S.prototype.SetFriction=function(a){if(a===undefined)a=0;this.m_friction=a};S.prototype.GetRestitution=
function(){return this.m_restitution};S.prototype.SetRestitution=function(a){if(a===undefined)a=0;this.m_restitution=a};S.prototype.GetAABB=function(){return this.m_aabb};S.prototype.b2Fixture=function(){this.m_aabb=new U;this.m_shape=this.m_next=this.m_body=this.m_userData=null;this.m_restitution=this.m_friction=this.m_density=0};S.prototype.Create=function(a,c,g){this.m_userData=g.userData;this.m_friction=g.friction;this.m_restitution=g.restitution;this.m_body=a;this.m_next=null;this.m_filter=g.filter.Copy();
this.m_isSensor=g.isSensor;this.m_shape=g.shape.Copy();this.m_density=g.density};S.prototype.Destroy=function(){this.m_shape=null};S.prototype.CreateProxy=function(a,c){this.m_shape.ComputeAABB(this.m_aabb,c);this.m_proxy=a.CreateProxy(this.m_aabb,this)};S.prototype.DestroyProxy=function(a){if(this.m_proxy!=null){a.DestroyProxy(this.m_proxy);this.m_proxy=null}};S.prototype.Synchronize=function(a,c,g){if(this.m_proxy){var b=new U,e=new U;this.m_shape.ComputeAABB(b,c);this.m_shape.ComputeAABB(e,g);
this.m_aabb.Combine(b,e);c=F.SubtractVV(g.position,c.position);a.MoveProxy(this.m_proxy,this.m_aabb,c)}};aa.b2FixtureDef=function(){this.filter=new N};aa.prototype.b2FixtureDef=function(){this.userData=this.shape=null;this.friction=0.2;this.density=this.restitution=0;this.filter.categoryBits=1;this.filter.maskBits=65535;this.filter.groupIndex=0;this.isSensor=false};Z.b2Island=function(){};Z.prototype.b2Island=function(){this.m_bodies=new Vector;this.m_contacts=new Vector;this.m_joints=new Vector};
Z.prototype.Initialize=function(a,c,g,b,e,f){if(a===undefined)a=0;if(c===undefined)c=0;if(g===undefined)g=0;var m=0;this.m_bodyCapacity=a;this.m_contactCapacity=c;this.m_jointCapacity=g;this.m_jointCount=this.m_contactCount=this.m_bodyCount=0;this.m_allocator=b;this.m_listener=e;this.m_contactSolver=f;for(m=this.m_bodies.length;m<a;m++)this.m_bodies[m]=null;for(m=this.m_contacts.length;m<c;m++)this.m_contacts[m]=null;for(m=this.m_joints.length;m<g;m++)this.m_joints[m]=null};Z.prototype.Clear=function(){this.m_jointCount=
this.m_contactCount=this.m_bodyCount=0};Z.prototype.Solve=function(a,c,g){var b=0,e=0,f;for(b=0;b<this.m_bodyCount;++b){e=this.m_bodies[b];if(e.GetType()==k.b2_dynamicBody){e.m_linearVelocity.x+=a.dt*(c.x+e.m_invMass*e.m_force.x);e.m_linearVelocity.y+=a.dt*(c.y+e.m_invMass*e.m_force.y);e.m_angularVelocity+=a.dt*e.m_invI*e.m_torque;e.m_linearVelocity.Multiply(F.Clamp(1-a.dt*e.m_linearDamping,0,1));e.m_angularVelocity*=F.Clamp(1-a.dt*e.m_angularDamping,0,1)}}this.m_contactSolver.Initialize(a,this.m_contacts,
this.m_contactCount,this.m_allocator);c=this.m_contactSolver;c.InitVelocityConstraints(a);for(b=0;b<this.m_jointCount;++b){f=this.m_joints[b];f.InitVelocityConstraints(a)}for(b=0;b<a.velocityIterations;++b){for(e=0;e<this.m_jointCount;++e){f=this.m_joints[e];f.SolveVelocityConstraints(a)}c.SolveVelocityConstraints()}for(b=0;b<this.m_jointCount;++b){f=this.m_joints[b];f.FinalizeVelocityConstraints()}c.FinalizeVelocityConstraints();for(b=0;b<this.m_bodyCount;++b){e=this.m_bodies[b];if(e.GetType()!=
k.b2_staticBody){var m=a.dt*e.m_linearVelocity.x,r=a.dt*e.m_linearVelocity.y;if(m*m+r*r>A.b2_maxTranslationSquared){e.m_linearVelocity.Normalize();e.m_linearVelocity.x*=A.b2_maxTranslation*a.inv_dt;e.m_linearVelocity.y*=A.b2_maxTranslation*a.inv_dt}m=a.dt*e.m_angularVelocity;if(m*m>A.b2_maxRotationSquared)e.m_angularVelocity=e.m_angularVelocity<0?-A.b2_maxRotation*a.inv_dt:A.b2_maxRotation*a.inv_dt;e.m_sweep.c0.SetV(e.m_sweep.c);e.m_sweep.a0=e.m_sweep.a;e.m_sweep.c.x+=a.dt*e.m_linearVelocity.x;e.m_sweep.c.y+=
a.dt*e.m_linearVelocity.y;e.m_sweep.a+=a.dt*e.m_angularVelocity;e.SynchronizeTransform()}}for(b=0;b<a.positionIterations;++b){m=c.SolvePositionConstraints(A.b2_contactBaumgarte);r=true;for(e=0;e<this.m_jointCount;++e){f=this.m_joints[e];f=f.SolvePositionConstraints(A.b2_contactBaumgarte);r=r&&f}if(m&&r)break}this.Report(c.m_constraints);if(g){g=Number.MAX_VALUE;c=A.b2_linearSleepTolerance*A.b2_linearSleepTolerance;m=A.b2_angularSleepTolerance*A.b2_angularSleepTolerance;for(b=0;b<this.m_bodyCount;++b){e=
this.m_bodies[b];if(e.GetType()!=k.b2_staticBody){if((e.m_flags&k.e_allowSleepFlag)==0)g=e.m_sleepTime=0;if((e.m_flags&k.e_allowSleepFlag)==0||e.m_angularVelocity*e.m_angularVelocity>m||F.Dot(e.m_linearVelocity,e.m_linearVelocity)>c)g=e.m_sleepTime=0;else{e.m_sleepTime+=a.dt;g=F.Min(g,e.m_sleepTime)}}}if(g>=A.b2_timeToSleep)for(b=0;b<this.m_bodyCount;++b){e=this.m_bodies[b];e.SetAwake(false)}}};Z.prototype.SolveTOI=function(a){var c=0,g=0;this.m_contactSolver.Initialize(a,this.m_contacts,this.m_contactCount,
this.m_allocator);var b=this.m_contactSolver;for(c=0;c<this.m_jointCount;++c)this.m_joints[c].InitVelocityConstraints(a);for(c=0;c<a.velocityIterations;++c){b.SolveVelocityConstraints();for(g=0;g<this.m_jointCount;++g)this.m_joints[g].SolveVelocityConstraints(a)}for(c=0;c<this.m_bodyCount;++c){g=this.m_bodies[c];if(g.GetType()!=k.b2_staticBody){var e=a.dt*g.m_linearVelocity.x,f=a.dt*g.m_linearVelocity.y;if(e*e+f*f>A.b2_maxTranslationSquared){g.m_linearVelocity.Normalize();g.m_linearVelocity.x*=A.b2_maxTranslation*
a.inv_dt;g.m_linearVelocity.y*=A.b2_maxTranslation*a.inv_dt}e=a.dt*g.m_angularVelocity;if(e*e>A.b2_maxRotationSquared)g.m_angularVelocity=g.m_angularVelocity<0?-A.b2_maxRotation*a.inv_dt:A.b2_maxRotation*a.inv_dt;g.m_sweep.c0.SetV(g.m_sweep.c);g.m_sweep.a0=g.m_sweep.a;g.m_sweep.c.x+=a.dt*g.m_linearVelocity.x;g.m_sweep.c.y+=a.dt*g.m_linearVelocity.y;g.m_sweep.a+=a.dt*g.m_angularVelocity;g.SynchronizeTransform()}}for(c=0;c<a.positionIterations;++c){e=b.SolvePositionConstraints(0.75);f=true;for(g=0;g<
this.m_jointCount;++g){var m=this.m_joints[g].SolvePositionConstraints(A.b2_contactBaumgarte);f=f&&m}if(e&&f)break}this.Report(b.m_constraints)};Z.prototype.Report=function(a){if(this.m_listener!=null)for(var c=0;c<this.m_contactCount;++c){for(var g=this.m_contacts[c],b=a[c],e=0;e<b.pointCount;++e){Z.s_impulse.normalImpulses[e]=b.points[e].normalImpulse;Z.s_impulse.tangentImpulses[e]=b.points[e].tangentImpulse}this.m_listener.PostSolve(g,Z.s_impulse)}};Z.prototype.AddBody=function(a){a.m_islandIndex=
this.m_bodyCount;this.m_bodies[this.m_bodyCount++]=a};Z.prototype.AddContact=function(a){this.m_contacts[this.m_contactCount++]=a};Z.prototype.AddJoint=function(a){this.m_joints[this.m_jointCount++]=a};Box2D.postDefs.push(function(){Box2D.Dynamics.b2Island.s_impulse=new D});d.b2TimeStep=function(){};d.prototype.Set=function(a){this.dt=a.dt;this.inv_dt=a.inv_dt;this.positionIterations=a.positionIterations;this.velocityIterations=a.velocityIterations;this.warmStarting=a.warmStarting};h.b2World=function(){this.s_stack=
new Vector;this.m_contactManager=new O;this.m_contactSolver=new o;this.m_island=new Z};h.prototype.b2World=function(a,c){this.m_controllerList=this.m_jointList=this.m_contactList=this.m_bodyList=this.m_debugDraw=this.m_destructionListener=null;this.m_controllerCount=this.m_jointCount=this.m_contactCount=this.m_bodyCount=0;h.m_warmStarting=true;h.m_continuousPhysics=true;this.m_allowSleep=c;this.m_gravity=a;this.m_inv_dt0=0;this.m_contactManager.m_world=this;this.m_groundBody=this.CreateBody(new z)};
h.prototype.SetDestructionListener=function(a){this.m_destructionListener=a};h.prototype.SetContactFilter=function(a){this.m_contactManager.m_contactFilter=a};h.prototype.SetContactListener=function(a){this.m_contactManager.m_contactListener=a};h.prototype.SetDebugDraw=function(a){this.m_debugDraw=a};h.prototype.SetBroadPhase=function(a){var c=this.m_contactManager.m_broadPhase;this.m_contactManager.m_broadPhase=a;for(var g=this.m_bodyList;g;g=g.m_next)for(var b=g.m_fixtureList;b;b=b.m_next)b.m_proxy=
a.CreateProxy(c.GetFatAABB(b.m_proxy),b)};h.prototype.Validate=function(){this.m_contactManager.m_broadPhase.Validate()};h.prototype.GetProxyCount=function(){return this.m_contactManager.m_broadPhase.GetProxyCount()};h.prototype.CreateBody=function(a){if(this.IsLocked()==true)return null;a=new k(a,this);a.m_prev=null;if(a.m_next=this.m_bodyList)this.m_bodyList.m_prev=a;this.m_bodyList=a;++this.m_bodyCount;return a};h.prototype.DestroyBody=function(a){if(this.IsLocked()!=true){for(var c=a.m_jointList;c;){var g=
c;c=c.next;this.m_destructionListener&&this.m_destructionListener.SayGoodbyeJoint(g.joint);this.DestroyJoint(g.joint)}for(c=a.m_controllerList;c;){g=c;c=c.nextController;g.controller.RemoveBody(a)}for(c=a.m_contactList;c;){g=c;c=c.next;this.m_contactManager.Destroy(g.contact)}a.m_contactList=null;for(c=a.m_fixtureList;c;){g=c;c=c.m_next;this.m_destructionListener&&this.m_destructionListener.SayGoodbyeFixture(g);g.DestroyProxy(this.m_contactManager.m_broadPhase);g.Destroy()}a.m_fixtureList=null;a.m_fixtureCount=
0;if(a.m_prev)a.m_prev.m_next=a.m_next;if(a.m_next)a.m_next.m_prev=a.m_prev;if(a==this.m_bodyList)this.m_bodyList=a.m_next;--this.m_bodyCount}};h.prototype.CreateJoint=function(a){var c=q.Create(a,null);c.m_prev=null;if(c.m_next=this.m_jointList)this.m_jointList.m_prev=c;this.m_jointList=c;++this.m_jointCount;c.m_edgeA.joint=c;c.m_edgeA.other=c.m_bodyB;c.m_edgeA.prev=null;if(c.m_edgeA.next=c.m_bodyA.m_jointList)c.m_bodyA.m_jointList.prev=c.m_edgeA;c.m_bodyA.m_jointList=c.m_edgeA;c.m_edgeB.joint=c;
c.m_edgeB.other=c.m_bodyA;c.m_edgeB.prev=null;if(c.m_edgeB.next=c.m_bodyB.m_jointList)c.m_bodyB.m_jointList.prev=c.m_edgeB;c.m_bodyB.m_jointList=c.m_edgeB;var g=a.bodyA,b=a.bodyB;if(a.collideConnected==false)for(a=b.GetContactList();a;){a.other==g&&a.contact.FlagForFiltering();a=a.next}return c};h.prototype.DestroyJoint=function(a){var c=a.m_collideConnected;if(a.m_prev)a.m_prev.m_next=a.m_next;if(a.m_next)a.m_next.m_prev=a.m_prev;if(a==this.m_jointList)this.m_jointList=a.m_next;var g=a.m_bodyA,b=
a.m_bodyB;g.SetAwake(true);b.SetAwake(true);if(a.m_edgeA.prev)a.m_edgeA.prev.next=a.m_edgeA.next;if(a.m_edgeA.next)a.m_edgeA.next.prev=a.m_edgeA.prev;if(a.m_edgeA==g.m_jointList)g.m_jointList=a.m_edgeA.next;a.m_edgeA.prev=null;a.m_edgeA.next=null;if(a.m_edgeB.prev)a.m_edgeB.prev.next=a.m_edgeB.next;if(a.m_edgeB.next)a.m_edgeB.next.prev=a.m_edgeB.prev;if(a.m_edgeB==b.m_jointList)b.m_jointList=a.m_edgeB.next;a.m_edgeB.prev=null;a.m_edgeB.next=null;q.Destroy(a,null);--this.m_jointCount;if(c==false)for(a=
b.GetContactList();a;){a.other==g&&a.contact.FlagForFiltering();a=a.next}};h.prototype.AddController=function(a){a.m_next=this.m_controllerList;a.m_prev=null;this.m_controllerList=a;a.m_world=this;this.m_controllerCount++;return a};h.prototype.RemoveController=function(a){if(a.m_prev)a.m_prev.m_next=a.m_next;if(a.m_next)a.m_next.m_prev=a.m_prev;if(this.m_controllerList==a)this.m_controllerList=a.m_next;this.m_controllerCount--};h.prototype.CreateController=function(a){if(a.m_world!=this)throw Error("Controller can only be a member of one world");
a.m_next=this.m_controllerList;a.m_prev=null;if(this.m_controllerList)this.m_controllerList.m_prev=a;this.m_controllerList=a;++this.m_controllerCount;a.m_world=this;return a};h.prototype.DestroyController=function(a){a.Clear();if(a.m_next)a.m_next.m_prev=a.m_prev;if(a.m_prev)a.m_prev.m_next=a.m_next;if(a==this.m_controllerList)this.m_controllerList=a.m_next;--this.m_controllerCount};h.prototype.SetWarmStarting=function(a){h.m_warmStarting=a};h.prototype.SetContinuousPhysics=function(a){h.m_continuousPhysics=
a};h.prototype.GetBodyCount=function(){return this.m_bodyCount};h.prototype.GetJointCount=function(){return this.m_jointCount};h.prototype.GetContactCount=function(){return this.m_contactCount};h.prototype.SetGravity=function(a){this.m_gravity=a};h.prototype.GetGravity=function(){return this.m_gravity};h.prototype.GetGroundBody=function(){return this.m_groundBody};h.prototype.Step=function(a,c,g){if(a===undefined)a=0;if(c===undefined)c=0;if(g===undefined)g=0;if(this.m_flags&h.e_newFixture){this.m_contactManager.FindNewContacts();
this.m_flags&=~h.e_newFixture}this.m_flags|=h.e_locked;var b=h.s_timestep2;b.dt=a;b.velocityIterations=c;b.positionIterations=g;b.inv_dt=a>0?1/a:0;b.dtRatio=this.m_inv_dt0*a;b.warmStarting=h.m_warmStarting;this.m_contactManager.Collide();b.dt>0&&this.Solve(b);h.m_continuousPhysics&&b.dt>0&&this.SolveTOI(b);if(b.dt>0)this.m_inv_dt0=b.inv_dt;this.m_flags&=~h.e_locked};h.prototype.ClearForces=function(){for(var a=this.m_bodyList;a;a=a.m_next){a.m_force.SetZero();a.m_torque=0}};h.prototype.DrawDebugData=
function(){if(this.m_debugDraw!=null){this.m_debugDraw.m_sprite.graphics.clear();var a=this.m_debugDraw.GetFlags(),c,g,b;new y;new y;new y;var e;new U;new U;e=[new y,new y,new y,new y];var f=new w(0,0,0);if(a&E.e_shapeBit)for(c=this.m_bodyList;c;c=c.m_next){e=c.m_xf;for(g=c.GetFixtureList();g;g=g.m_next){b=g.GetShape();if(c.IsActive()==false)f.Set(0.5,0.5,0.3);else if(c.GetType()==k.b2_staticBody)f.Set(0.5,0.9,0.5);else if(c.GetType()==k.b2_kinematicBody)f.Set(0.5,0.5,0.9);else c.IsAwake()==false?
f.Set(0.6,0.6,0.6):f.Set(0.9,0.7,0.7);this.DrawShape(b,e,f)}}if(a&E.e_jointBit)for(c=this.m_jointList;c;c=c.m_next)this.DrawJoint(c);if(a&E.e_controllerBit)for(c=this.m_controllerList;c;c=c.m_next)c.Draw(this.m_debugDraw);if(a&E.e_pairBit){f.Set(0.3,0.9,0.9);for(c=this.m_contactManager.m_contactList;c;c=c.GetNext()){b=c.GetFixtureA();g=c.GetFixtureB();b=b.GetAABB().GetCenter();g=g.GetAABB().GetCenter();this.m_debugDraw.DrawSegment(b,g,f)}}if(a&E.e_aabbBit){b=this.m_contactManager.m_broadPhase;e=[new y,
new y,new y,new y];for(c=this.m_bodyList;c;c=c.GetNext())if(c.IsActive()!=false)for(g=c.GetFixtureList();g;g=g.GetNext()){var m=b.GetFatAABB(g.m_proxy);e[0].Set(m.lowerBound.x,m.lowerBound.y);e[1].Set(m.upperBound.x,m.lowerBound.y);e[2].Set(m.upperBound.x,m.upperBound.y);e[3].Set(m.lowerBound.x,m.upperBound.y);this.m_debugDraw.DrawPolygon(e,4,f)}}if(a&E.e_centerOfMassBit)for(c=this.m_bodyList;c;c=c.m_next){e=h.s_xf;e.R=c.m_xf.R;e.position=c.GetWorldCenter();this.m_debugDraw.DrawTransform(e)}}};h.prototype.QueryAABB=
function(a,c){var g=this.m_contactManager.m_broadPhase;g.Query(function(b){return a(g.GetUserData(b))},c)};h.prototype.QueryShape=function(a,c,g){if(g===undefined)g=null;if(g==null){g=new K;g.SetIdentity()}var b=this.m_contactManager.m_broadPhase,e=new U;c.ComputeAABB(e,g);b.Query(function(f){f=b.GetUserData(f)instanceof S?b.GetUserData(f):null;if(Y.TestOverlap(c,g,f.GetShape(),f.GetBody().GetTransform()))return a(f);return true},e)};h.prototype.QueryPoint=function(a,c){var g=this.m_contactManager.m_broadPhase,
b=new U;b.lowerBound.Set(c.x-A.b2_linearSlop,c.y-A.b2_linearSlop);b.upperBound.Set(c.x+A.b2_linearSlop,c.y+A.b2_linearSlop);g.Query(function(e){e=g.GetUserData(e)instanceof S?g.GetUserData(e):null;if(e.TestPoint(c))return a(e);return true},b)};h.prototype.RayCast=function(a,c,g){var b=this.m_contactManager.m_broadPhase,e=new V,f=new Q(c,g);b.RayCast(function(m,r){var s=b.GetUserData(r);s=s instanceof S?s:null;if(s.RayCast(e,m)){var v=e.fraction,t=new y((1-v)*c.x+v*g.x,(1-v)*c.y+v*g.y);return a(s,
t,e.normal,v)}return m.maxFraction},f)};h.prototype.RayCastOne=function(a,c){var g;this.RayCast(function(b,e,f,m){if(m===undefined)m=0;g=b;return m},a,c);return g};h.prototype.RayCastAll=function(a,c){var g=new Vector;this.RayCast(function(b){g[g.length]=b;return 1},a,c);return g};h.prototype.GetBodyList=function(){return this.m_bodyList};h.prototype.GetJointList=function(){return this.m_jointList};h.prototype.GetContactList=function(){return this.m_contactList};h.prototype.IsLocked=function(){return(this.m_flags&
h.e_locked)>0};h.prototype.Solve=function(a){for(var c,g=this.m_controllerList;g;g=g.m_next)g.Step(a);g=this.m_island;g.Initialize(this.m_bodyCount,this.m_contactCount,this.m_jointCount,null,this.m_contactManager.m_contactListener,this.m_contactSolver);for(c=this.m_bodyList;c;c=c.m_next)c.m_flags&=~k.e_islandFlag;for(var b=this.m_contactList;b;b=b.m_next)b.m_flags&=~l.e_islandFlag;for(b=this.m_jointList;b;b=b.m_next)b.m_islandFlag=false;parseInt(this.m_bodyCount);b=this.s_stack;for(var e=this.m_bodyList;e;e=
e.m_next)if(!(e.m_flags&k.e_islandFlag))if(!(e.IsAwake()==false||e.IsActive()==false))if(e.GetType()!=k.b2_staticBody){g.Clear();var f=0;b[f++]=e;for(e.m_flags|=k.e_islandFlag;f>0;){c=b[--f];g.AddBody(c);c.IsAwake()==false&&c.SetAwake(true);if(c.GetType()!=k.b2_staticBody){for(var m,r=c.m_contactList;r;r=r.next)if(!(r.contact.m_flags&l.e_islandFlag))if(!(r.contact.IsSensor()==true||r.contact.IsEnabled()==false||r.contact.IsTouching()==false)){g.AddContact(r.contact);r.contact.m_flags|=l.e_islandFlag;
m=r.other;if(!(m.m_flags&k.e_islandFlag)){b[f++]=m;m.m_flags|=k.e_islandFlag}}for(c=c.m_jointList;c;c=c.next)if(c.joint.m_islandFlag!=true){m=c.other;if(m.IsActive()!=false){g.AddJoint(c.joint);c.joint.m_islandFlag=true;if(!(m.m_flags&k.e_islandFlag)){b[f++]=m;m.m_flags|=k.e_islandFlag}}}}}g.Solve(a,this.m_gravity,this.m_allowSleep);for(f=0;f<g.m_bodyCount;++f){c=g.m_bodies[f];if(c.GetType()==k.b2_staticBody)c.m_flags&=~k.e_islandFlag}}for(f=0;f<b.length;++f){if(!b[f])break;b[f]=null}for(c=this.m_bodyList;c;c=
c.m_next)c.IsAwake()==false||c.IsActive()==false||c.GetType()!=k.b2_staticBody&&c.SynchronizeFixtures();this.m_contactManager.FindNewContacts()};h.prototype.SolveTOI=function(a){var c,g,b,e=this.m_island;e.Initialize(this.m_bodyCount,A.b2_maxTOIContactsPerIsland,A.b2_maxTOIJointsPerIsland,null,this.m_contactManager.m_contactListener,this.m_contactSolver);var f=h.s_queue;for(c=this.m_bodyList;c;c=c.m_next){c.m_flags&=~k.e_islandFlag;c.m_sweep.t0=0}for(b=this.m_contactList;b;b=b.m_next)b.m_flags&=~(l.e_toiFlag|
l.e_islandFlag);for(b=this.m_jointList;b;b=b.m_next)b.m_islandFlag=false;for(;;){var m=null,r=1;for(b=this.m_contactList;b;b=b.m_next)if(!(b.IsSensor()==true||b.IsEnabled()==false||b.IsContinuous()==false)){c=1;if(b.m_flags&l.e_toiFlag)c=b.m_toi;else{c=b.m_fixtureA;g=b.m_fixtureB;c=c.m_body;g=g.m_body;if((c.GetType()!=k.b2_dynamicBody||c.IsAwake()==false)&&(g.GetType()!=k.b2_dynamicBody||g.IsAwake()==false))continue;var s=c.m_sweep.t0;if(c.m_sweep.t0<g.m_sweep.t0){s=g.m_sweep.t0;c.m_sweep.Advance(s)}else if(g.m_sweep.t0<
c.m_sweep.t0){s=c.m_sweep.t0;g.m_sweep.Advance(s)}c=b.ComputeTOI(c.m_sweep,g.m_sweep);A.b2Assert(0<=c&&c<=1);if(c>0&&c<1){c=(1-c)*s+c;if(c>1)c=1}b.m_toi=c;b.m_flags|=l.e_toiFlag}if(Number.MIN_VALUE<c&&c<r){m=b;r=c}}if(m==null||1-100*Number.MIN_VALUE<r)break;c=m.m_fixtureA;g=m.m_fixtureB;c=c.m_body;g=g.m_body;h.s_backupA.Set(c.m_sweep);h.s_backupB.Set(g.m_sweep);c.Advance(r);g.Advance(r);m.Update(this.m_contactManager.m_contactListener);m.m_flags&=~l.e_toiFlag;if(m.IsSensor()==true||m.IsEnabled()==
false){c.m_sweep.Set(h.s_backupA);g.m_sweep.Set(h.s_backupB);c.SynchronizeTransform();g.SynchronizeTransform()}else if(m.IsTouching()!=false){c=c;if(c.GetType()!=k.b2_dynamicBody)c=g;e.Clear();m=b=0;f[b+m++]=c;for(c.m_flags|=k.e_islandFlag;m>0;){c=f[b++];--m;e.AddBody(c);c.IsAwake()==false&&c.SetAwake(true);if(c.GetType()==k.b2_dynamicBody){for(g=c.m_contactList;g;g=g.next){if(e.m_contactCount==e.m_contactCapacity)break;if(!(g.contact.m_flags&l.e_islandFlag))if(!(g.contact.IsSensor()==true||g.contact.IsEnabled()==
false||g.contact.IsTouching()==false)){e.AddContact(g.contact);g.contact.m_flags|=l.e_islandFlag;s=g.other;if(!(s.m_flags&k.e_islandFlag)){if(s.GetType()!=k.b2_staticBody){s.Advance(r);s.SetAwake(true)}f[b+m]=s;++m;s.m_flags|=k.e_islandFlag}}}for(c=c.m_jointList;c;c=c.next)if(e.m_jointCount!=e.m_jointCapacity)if(c.joint.m_islandFlag!=true){s=c.other;if(s.IsActive()!=false){e.AddJoint(c.joint);c.joint.m_islandFlag=true;if(!(s.m_flags&k.e_islandFlag)){if(s.GetType()!=k.b2_staticBody){s.Advance(r);s.SetAwake(true)}f[b+
m]=s;++m;s.m_flags|=k.e_islandFlag}}}}}b=h.s_timestep;b.warmStarting=false;b.dt=(1-r)*a.dt;b.inv_dt=1/b.dt;b.dtRatio=0;b.velocityIterations=a.velocityIterations;b.positionIterations=a.positionIterations;e.SolveTOI(b);for(r=r=0;r<e.m_bodyCount;++r){c=e.m_bodies[r];c.m_flags&=~k.e_islandFlag;if(c.IsAwake()!=false)if(c.GetType()==k.b2_dynamicBody){c.SynchronizeFixtures();for(g=c.m_contactList;g;g=g.next)g.contact.m_flags&=~l.e_toiFlag}}for(r=0;r<e.m_contactCount;++r){b=e.m_contacts[r];b.m_flags&=~(l.e_toiFlag|
l.e_islandFlag)}for(r=0;r<e.m_jointCount;++r){b=e.m_joints[r];b.m_islandFlag=false}this.m_contactManager.FindNewContacts()}}};h.prototype.DrawJoint=function(a){var c=a.GetBodyA(),g=a.GetBodyB(),b=c.m_xf.position,e=g.m_xf.position,f=a.GetAnchorA(),m=a.GetAnchorB(),r=h.s_jointColor;switch(a.m_type){case q.e_distanceJoint:this.m_debugDraw.DrawSegment(f,m,r);break;case q.e_pulleyJoint:c=a instanceof n?a:null;a=c.GetGroundAnchorA();c=c.GetGroundAnchorB();this.m_debugDraw.DrawSegment(a,f,r);this.m_debugDraw.DrawSegment(c,
m,r);this.m_debugDraw.DrawSegment(a,c,r);break;case q.e_mouseJoint:this.m_debugDraw.DrawSegment(f,m,r);break;default:c!=this.m_groundBody&&this.m_debugDraw.DrawSegment(b,f,r);this.m_debugDraw.DrawSegment(f,m,r);g!=this.m_groundBody&&this.m_debugDraw.DrawSegment(e,m,r)}};h.prototype.DrawShape=function(a,c,g){switch(a.m_type){case Y.e_circleShape:var b=a instanceof M?a:null;this.m_debugDraw.DrawSolidCircle(F.MulX(c,b.m_p),b.m_radius,c.R.col1,g);break;case Y.e_polygonShape:b=0;b=a instanceof W?a:null;
a=parseInt(b.GetVertexCount());var e=b.GetVertices(),f=new Vector(a);for(b=0;b<a;++b)f[b]=F.MulX(c,e[b]);this.m_debugDraw.DrawSolidPolygon(f,a,g);break;case Y.e_edgeShape:b=a instanceof L?a:null;this.m_debugDraw.DrawSegment(F.MulX(c,b.GetVertex1()),F.MulX(c,b.GetVertex2()),g)}};Box2D.postDefs.push(function(){Box2D.Dynamics.b2World.s_timestep2=new d;Box2D.Dynamics.b2World.s_xf=new K;Box2D.Dynamics.b2World.s_backupA=new G;Box2D.Dynamics.b2World.s_backupB=new G;Box2D.Dynamics.b2World.s_timestep=new d;
Box2D.Dynamics.b2World.s_queue=new Vector;Box2D.Dynamics.b2World.s_jointColor=new w(0.5,0.8,0.8);Box2D.Dynamics.b2World.e_newFixture=1;Box2D.Dynamics.b2World.e_locked=2})})();
(function(){var F=Box2D.Collision.Shapes.b2CircleShape,G=Box2D.Collision.Shapes.b2EdgeShape,K=Box2D.Collision.Shapes.b2PolygonShape,y=Box2D.Collision.Shapes.b2Shape,w=Box2D.Dynamics.Contacts.b2CircleContact,A=Box2D.Dynamics.Contacts.b2Contact,U=Box2D.Dynamics.Contacts.b2ContactConstraint,p=Box2D.Dynamics.Contacts.b2ContactConstraintPoint,B=Box2D.Dynamics.Contacts.b2ContactEdge,Q=Box2D.Dynamics.Contacts.b2ContactFactory,V=Box2D.Dynamics.Contacts.b2ContactRegister,M=Box2D.Dynamics.Contacts.b2ContactResult,
L=Box2D.Dynamics.Contacts.b2ContactSolver,I=Box2D.Dynamics.Contacts.b2EdgeAndCircleContact,W=Box2D.Dynamics.Contacts.b2NullContact,Y=Box2D.Dynamics.Contacts.b2PolyAndCircleContact,k=Box2D.Dynamics.Contacts.b2PolyAndEdgeContact,z=Box2D.Dynamics.Contacts.b2PolygonContact,u=Box2D.Dynamics.Contacts.b2PositionSolverManifold,D=Box2D.Dynamics.b2Body,H=Box2D.Dynamics.b2TimeStep,O=Box2D.Common.b2Settings,E=Box2D.Common.Math.b2Mat22,R=Box2D.Common.Math.b2Math,N=Box2D.Common.Math.b2Vec2,S=Box2D.Collision.b2Collision,
aa=Box2D.Collision.b2ContactID,Z=Box2D.Collision.b2Manifold,d=Box2D.Collision.b2TimeOfImpact,h=Box2D.Collision.b2TOIInput,l=Box2D.Collision.b2WorldManifold;Box2D.inherit(w,Box2D.Dynamics.Contacts.b2Contact);w.prototype.__super=Box2D.Dynamics.Contacts.b2Contact.prototype;w.b2CircleContact=function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};w.Create=function(){return new w};w.Destroy=function(){};w.prototype.Reset=function(j,o){this.__super.Reset.call(this,j,o)};w.prototype.Evaluate=
function(){var j=this.m_fixtureA.GetBody(),o=this.m_fixtureB.GetBody();S.CollideCircles(this.m_manifold,this.m_fixtureA.GetShape()instanceof F?this.m_fixtureA.GetShape():null,j.m_xf,this.m_fixtureB.GetShape()instanceof F?this.m_fixtureB.GetShape():null,o.m_xf)};A.b2Contact=function(){this.m_nodeA=new B;this.m_nodeB=new B;this.m_manifold=new Z;this.m_oldManifold=new Z};A.prototype.GetManifold=function(){return this.m_manifold};A.prototype.GetWorldManifold=function(j){var o=this.m_fixtureA.GetBody(),
q=this.m_fixtureB.GetBody(),n=this.m_fixtureA.GetShape(),a=this.m_fixtureB.GetShape();j.Initialize(this.m_manifold,o.GetTransform(),n.m_radius,q.GetTransform(),a.m_radius)};A.prototype.IsTouching=function(){return(this.m_flags&A.e_touchingFlag)==A.e_touchingFlag};A.prototype.IsContinuous=function(){return(this.m_flags&A.e_continuousFlag)==A.e_continuousFlag};A.prototype.SetSensor=function(j){if(j)this.m_flags|=A.e_sensorFlag;else this.m_flags&=~A.e_sensorFlag};A.prototype.IsSensor=function(){return(this.m_flags&
A.e_sensorFlag)==A.e_sensorFlag};A.prototype.SetEnabled=function(j){if(j)this.m_flags|=A.e_enabledFlag;else this.m_flags&=~A.e_enabledFlag};A.prototype.IsEnabled=function(){return(this.m_flags&A.e_enabledFlag)==A.e_enabledFlag};A.prototype.GetNext=function(){return this.m_next};A.prototype.GetFixtureA=function(){return this.m_fixtureA};A.prototype.GetFixtureB=function(){return this.m_fixtureB};A.prototype.FlagForFiltering=function(){this.m_flags|=A.e_filterFlag};A.prototype.b2Contact=function(){};
A.prototype.Reset=function(j,o){if(j===undefined)j=null;if(o===undefined)o=null;this.m_flags=A.e_enabledFlag;if(!j||!o)this.m_fixtureB=this.m_fixtureA=null;else{if(j.IsSensor()||o.IsSensor())this.m_flags|=A.e_sensorFlag;var q=j.GetBody(),n=o.GetBody();if(q.GetType()!=D.b2_dynamicBody||q.IsBullet()||n.GetType()!=D.b2_dynamicBody||n.IsBullet())this.m_flags|=A.e_continuousFlag;this.m_fixtureA=j;this.m_fixtureB=o;this.m_manifold.m_pointCount=0;this.m_next=this.m_prev=null;this.m_nodeA.contact=null;this.m_nodeA.prev=
null;this.m_nodeA.next=null;this.m_nodeA.other=null;this.m_nodeB.contact=null;this.m_nodeB.prev=null;this.m_nodeB.next=null;this.m_nodeB.other=null}};A.prototype.Update=function(j){var o=this.m_oldManifold;this.m_oldManifold=this.m_manifold;this.m_manifold=o;this.m_flags|=A.e_enabledFlag;var q=false;o=(this.m_flags&A.e_touchingFlag)==A.e_touchingFlag;var n=this.m_fixtureA.m_body,a=this.m_fixtureB.m_body,c=this.m_fixtureA.m_aabb.TestOverlap(this.m_fixtureB.m_aabb);if(this.m_flags&A.e_sensorFlag){if(c){q=
this.m_fixtureA.GetShape();c=this.m_fixtureB.GetShape();n=n.GetTransform();a=a.GetTransform();q=y.TestOverlap(q,n,c,a)}this.m_manifold.m_pointCount=0}else{if(n.GetType()!=D.b2_dynamicBody||n.IsBullet()||a.GetType()!=D.b2_dynamicBody||a.IsBullet())this.m_flags|=A.e_continuousFlag;else this.m_flags&=~A.e_continuousFlag;if(c){this.Evaluate();q=this.m_manifold.m_pointCount>0;for(c=0;c<this.m_manifold.m_pointCount;++c){var g=this.m_manifold.m_points[c];g.m_normalImpulse=0;g.m_tangentImpulse=0;for(var b=
g.m_id,e=0;e<this.m_oldManifold.m_pointCount;++e){var f=this.m_oldManifold.m_points[e];if(f.m_id.key==b.key){g.m_normalImpulse=f.m_normalImpulse;g.m_tangentImpulse=f.m_tangentImpulse;break}}}}else this.m_manifold.m_pointCount=0;if(q!=o){n.SetAwake(true);a.SetAwake(true)}}if(q)this.m_flags|=A.e_touchingFlag;else this.m_flags&=~A.e_touchingFlag;o==false&&q==true&&j.BeginContact(this);o==true&&q==false&&j.EndContact(this);(this.m_flags&A.e_sensorFlag)==0&&j.PreSolve(this,this.m_oldManifold)};A.prototype.Evaluate=
function(){};A.prototype.ComputeTOI=function(j,o){A.s_input.proxyA.Set(this.m_fixtureA.GetShape());A.s_input.proxyB.Set(this.m_fixtureB.GetShape());A.s_input.sweepA=j;A.s_input.sweepB=o;A.s_input.tolerance=O.b2_linearSlop;return d.TimeOfImpact(A.s_input)};Box2D.postDefs.push(function(){Box2D.Dynamics.Contacts.b2Contact.e_sensorFlag=1;Box2D.Dynamics.Contacts.b2Contact.e_continuousFlag=2;Box2D.Dynamics.Contacts.b2Contact.e_islandFlag=4;Box2D.Dynamics.Contacts.b2Contact.e_toiFlag=8;Box2D.Dynamics.Contacts.b2Contact.e_touchingFlag=
16;Box2D.Dynamics.Contacts.b2Contact.e_enabledFlag=32;Box2D.Dynamics.Contacts.b2Contact.e_filterFlag=64;Box2D.Dynamics.Contacts.b2Contact.s_input=new h});U.b2ContactConstraint=function(){this.localPlaneNormal=new N;this.localPoint=new N;this.normal=new N;this.normalMass=new E;this.K=new E};U.prototype.b2ContactConstraint=function(){this.points=new Vector(O.b2_maxManifoldPoints);for(var j=0;j<O.b2_maxManifoldPoints;j++)this.points[j]=new p};p.b2ContactConstraintPoint=function(){this.localPoint=new N;
this.rA=new N;this.rB=new N};B.b2ContactEdge=function(){};Q.b2ContactFactory=function(){};Q.prototype.b2ContactFactory=function(j){this.m_allocator=j;this.InitializeRegisters()};Q.prototype.AddType=function(j,o,q,n){if(q===undefined)q=0;if(n===undefined)n=0;this.m_registers[q][n].createFcn=j;this.m_registers[q][n].destroyFcn=o;this.m_registers[q][n].primary=true;if(q!=n){this.m_registers[n][q].createFcn=j;this.m_registers[n][q].destroyFcn=o;this.m_registers[n][q].primary=false}};Q.prototype.InitializeRegisters=
function(){this.m_registers=new Vector(y.e_shapeTypeCount);for(var j=0;j<y.e_shapeTypeCount;j++){this.m_registers[j]=new Vector(y.e_shapeTypeCount);for(var o=0;o<y.e_shapeTypeCount;o++)this.m_registers[j][o]=new V}this.AddType(w.Create,w.Destroy,y.e_circleShape,y.e_circleShape);this.AddType(Y.Create,Y.Destroy,y.e_polygonShape,y.e_circleShape);this.AddType(z.Create,z.Destroy,y.e_polygonShape,y.e_polygonShape);this.AddType(I.Create,I.Destroy,y.e_edgeShape,y.e_circleShape);this.AddType(k.Create,k.Destroy,
y.e_polygonShape,y.e_edgeShape)};Q.prototype.Create=function(j,o){var q=parseInt(j.GetType()),n=parseInt(o.GetType());q=this.m_registers[q][n];if(q.pool){n=q.pool;q.pool=n.m_next;q.poolCount--;n.Reset(j,o);return n}n=q.createFcn;if(n!=null){if(q.primary){n=n(this.m_allocator);n.Reset(j,o)}else{n=n(this.m_allocator);n.Reset(o,j)}return n}else return null};Q.prototype.Destroy=function(j){if(j.m_manifold.m_pointCount>0){j.m_fixtureA.m_body.SetAwake(true);j.m_fixtureB.m_body.SetAwake(true)}var o=parseInt(j.m_fixtureA.GetType()),
q=parseInt(j.m_fixtureB.GetType());o=this.m_registers[o][q];o.poolCount++;j.m_next=o.pool;o.pool=j;o=o.destroyFcn;o(j,this.m_allocator)};V.b2ContactRegister=function(){};M.b2ContactResult=function(){this.position=new N;this.normal=new N;this.id=new aa};L.b2ContactSolver=function(){this.m_step=new H;this.m_constraints=new Vector};L.prototype.b2ContactSolver=function(){};L.prototype.Initialize=function(j,o,q,n){if(q===undefined)q=0;var a;this.m_step.Set(j);this.m_allocator=n;j=0;for(this.m_constraintCount=
q;this.m_constraints.length<this.m_constraintCount;)this.m_constraints[this.m_constraints.length]=new U;for(j=0;j<q;++j){a=o[j];n=a.m_fixtureA;var c=a.m_fixtureB,g=n.m_shape.m_radius,b=c.m_shape.m_radius,e=n.m_body,f=c.m_body,m=a.GetManifold(),r=O.b2MixFriction(n.GetFriction(),c.GetFriction()),s=O.b2MixRestitution(n.GetRestitution(),c.GetRestitution()),v=e.m_linearVelocity.x,t=e.m_linearVelocity.y,x=f.m_linearVelocity.x,C=f.m_linearVelocity.y,J=e.m_angularVelocity,T=f.m_angularVelocity;O.b2Assert(m.m_pointCount>
0);L.s_worldManifold.Initialize(m,e.m_xf,g,f.m_xf,b);c=L.s_worldManifold.m_normal.x;a=L.s_worldManifold.m_normal.y;n=this.m_constraints[j];n.bodyA=e;n.bodyB=f;n.manifold=m;n.normal.x=c;n.normal.y=a;n.pointCount=m.m_pointCount;n.friction=r;n.restitution=s;n.localPlaneNormal.x=m.m_localPlaneNormal.x;n.localPlaneNormal.y=m.m_localPlaneNormal.y;n.localPoint.x=m.m_localPoint.x;n.localPoint.y=m.m_localPoint.y;n.radius=g+b;n.type=m.m_type;for(g=0;g<n.pointCount;++g){r=m.m_points[g];b=n.points[g];b.normalImpulse=
r.m_normalImpulse;b.tangentImpulse=r.m_tangentImpulse;b.localPoint.SetV(r.m_localPoint);r=b.rA.x=L.s_worldManifold.m_points[g].x-e.m_sweep.c.x;s=b.rA.y=L.s_worldManifold.m_points[g].y-e.m_sweep.c.y;var P=b.rB.x=L.s_worldManifold.m_points[g].x-f.m_sweep.c.x,X=b.rB.y=L.s_worldManifold.m_points[g].y-f.m_sweep.c.y,$=r*a-s*c,ba=P*a-X*c;$*=$;ba*=ba;b.normalMass=1/(e.m_invMass+f.m_invMass+e.m_invI*$+f.m_invI*ba);var ca=e.m_mass*e.m_invMass+f.m_mass*f.m_invMass;ca+=e.m_mass*e.m_invI*$+f.m_mass*f.m_invI*ba;
b.equalizedMass=1/ca;ba=a;ca=-c;$=r*ca-s*ba;ba=P*ca-X*ba;$*=$;ba*=ba;b.tangentMass=1/(e.m_invMass+f.m_invMass+e.m_invI*$+f.m_invI*ba);b.velocityBias=0;r=n.normal.x*(x+-T*X-v- -J*s)+n.normal.y*(C+T*P-t-J*r);if(r<-O.b2_velocityThreshold)b.velocityBias+=-n.restitution*r}if(n.pointCount==2){C=n.points[0];x=n.points[1];m=e.m_invMass;e=e.m_invI;v=f.m_invMass;f=f.m_invI;t=C.rA.x*a-C.rA.y*c;C=C.rB.x*a-C.rB.y*c;J=x.rA.x*a-x.rA.y*c;x=x.rB.x*a-x.rB.y*c;c=m+v+e*t*t+f*C*C;a=m+v+e*J*J+f*x*x;f=m+v+e*t*J+f*C*x;if(c*
c<100*(c*a-f*f)){n.K.col1.Set(c,f);n.K.col2.Set(f,a);n.K.GetInverse(n.normalMass)}else n.pointCount=1}}};L.prototype.InitVelocityConstraints=function(j){for(var o=0;o<this.m_constraintCount;++o){var q=this.m_constraints[o],n=q.bodyA,a=q.bodyB,c=n.m_invMass,g=n.m_invI,b=a.m_invMass,e=a.m_invI,f=q.normal.x,m=q.normal.y,r=m,s=-f,v=0,t=0;if(j.warmStarting){t=q.pointCount;for(v=0;v<t;++v){var x=q.points[v];x.normalImpulse*=j.dtRatio;x.tangentImpulse*=j.dtRatio;var C=x.normalImpulse*f+x.tangentImpulse*
r,J=x.normalImpulse*m+x.tangentImpulse*s;n.m_angularVelocity-=g*(x.rA.x*J-x.rA.y*C);n.m_linearVelocity.x-=c*C;n.m_linearVelocity.y-=c*J;a.m_angularVelocity+=e*(x.rB.x*J-x.rB.y*C);a.m_linearVelocity.x+=b*C;a.m_linearVelocity.y+=b*J}}else{t=q.pointCount;for(v=0;v<t;++v){n=q.points[v];n.normalImpulse=0;n.tangentImpulse=0}}}};L.prototype.SolveVelocityConstraints=function(){for(var j=0,o,q=0,n=0,a=0,c=n=n=q=q=0,g=q=q=0,b=q=a=0,e=0,f,m=0;m<this.m_constraintCount;++m){a=this.m_constraints[m];var r=a.bodyA,
s=a.bodyB,v=r.m_angularVelocity,t=s.m_angularVelocity,x=r.m_linearVelocity,C=s.m_linearVelocity,J=r.m_invMass,T=r.m_invI,P=s.m_invMass,X=s.m_invI;b=a.normal.x;var $=e=a.normal.y;f=-b;g=a.friction;for(j=0;j<a.pointCount;j++){o=a.points[j];q=C.x-t*o.rB.y-x.x+v*o.rA.y;n=C.y+t*o.rB.x-x.y-v*o.rA.x;q=q*$+n*f;q=o.tangentMass*-q;n=g*o.normalImpulse;n=R.Clamp(o.tangentImpulse+q,-n,n);q=n-o.tangentImpulse;c=q*$;q=q*f;x.x-=J*c;x.y-=J*q;v-=T*(o.rA.x*q-o.rA.y*c);C.x+=P*c;C.y+=P*q;t+=X*(o.rB.x*q-o.rB.y*c);o.tangentImpulse=
n}parseInt(a.pointCount);if(a.pointCount==1){o=a.points[0];q=C.x+-t*o.rB.y-x.x- -v*o.rA.y;n=C.y+t*o.rB.x-x.y-v*o.rA.x;a=q*b+n*e;q=-o.normalMass*(a-o.velocityBias);n=o.normalImpulse+q;n=n>0?n:0;q=n-o.normalImpulse;c=q*b;q=q*e;x.x-=J*c;x.y-=J*q;v-=T*(o.rA.x*q-o.rA.y*c);C.x+=P*c;C.y+=P*q;t+=X*(o.rB.x*q-o.rB.y*c);o.normalImpulse=n}else{o=a.points[0];j=a.points[1];q=o.normalImpulse;g=j.normalImpulse;var ba=(C.x-t*o.rB.y-x.x+v*o.rA.y)*b+(C.y+t*o.rB.x-x.y-v*o.rA.x)*e,ca=(C.x-t*j.rB.y-x.x+v*j.rA.y)*b+(C.y+
t*j.rB.x-x.y-v*j.rA.x)*e;n=ba-o.velocityBias;c=ca-j.velocityBias;f=a.K;n-=f.col1.x*q+f.col2.x*g;for(c-=f.col1.y*q+f.col2.y*g;;){f=a.normalMass;$=-(f.col1.x*n+f.col2.x*c);f=-(f.col1.y*n+f.col2.y*c);if($>=0&&f>=0){q=$-q;g=f-g;a=q*b;q=q*e;b=g*b;e=g*e;x.x-=J*(a+b);x.y-=J*(q+e);v-=T*(o.rA.x*q-o.rA.y*a+j.rA.x*e-j.rA.y*b);C.x+=P*(a+b);C.y+=P*(q+e);t+=X*(o.rB.x*q-o.rB.y*a+j.rB.x*e-j.rB.y*b);o.normalImpulse=$;j.normalImpulse=f;break}$=-o.normalMass*n;f=0;ca=a.K.col1.y*$+c;if($>=0&&ca>=0){q=$-q;g=f-g;a=q*b;
q=q*e;b=g*b;e=g*e;x.x-=J*(a+b);x.y-=J*(q+e);v-=T*(o.rA.x*q-o.rA.y*a+j.rA.x*e-j.rA.y*b);C.x+=P*(a+b);C.y+=P*(q+e);t+=X*(o.rB.x*q-o.rB.y*a+j.rB.x*e-j.rB.y*b);o.normalImpulse=$;j.normalImpulse=f;break}$=0;f=-j.normalMass*c;ba=a.K.col2.x*f+n;if(f>=0&&ba>=0){q=$-q;g=f-g;a=q*b;q=q*e;b=g*b;e=g*e;x.x-=J*(a+b);x.y-=J*(q+e);v-=T*(o.rA.x*q-o.rA.y*a+j.rA.x*e-j.rA.y*b);C.x+=P*(a+b);C.y+=P*(q+e);t+=X*(o.rB.x*q-o.rB.y*a+j.rB.x*e-j.rB.y*b);o.normalImpulse=$;j.normalImpulse=f;break}f=$=0;ba=n;ca=c;if(ba>=0&&ca>=0){q=
$-q;g=f-g;a=q*b;q=q*e;b=g*b;e=g*e;x.x-=J*(a+b);x.y-=J*(q+e);v-=T*(o.rA.x*q-o.rA.y*a+j.rA.x*e-j.rA.y*b);C.x+=P*(a+b);C.y+=P*(q+e);t+=X*(o.rB.x*q-o.rB.y*a+j.rB.x*e-j.rB.y*b);o.normalImpulse=$;j.normalImpulse=f;break}break}}r.m_angularVelocity=v;s.m_angularVelocity=t}};L.prototype.FinalizeVelocityConstraints=function(){for(var j=0;j<this.m_constraintCount;++j)for(var o=this.m_constraints[j],q=o.manifold,n=0;n<o.pointCount;++n){var a=q.m_points[n],c=o.points[n];a.m_normalImpulse=c.normalImpulse;a.m_tangentImpulse=
c.tangentImpulse}};L.prototype.SolvePositionConstraints=function(j){if(j===undefined)j=0;for(var o=0,q=0;q<this.m_constraintCount;q++){var n=this.m_constraints[q],a=n.bodyA,c=n.bodyB,g=a.m_mass*a.m_invMass,b=a.m_mass*a.m_invI,e=c.m_mass*c.m_invMass,f=c.m_mass*c.m_invI;L.s_psm.Initialize(n);for(var m=L.s_psm.m_normal,r=0;r<n.pointCount;r++){var s=n.points[r],v=L.s_psm.m_points[r],t=L.s_psm.m_separations[r],x=v.x-a.m_sweep.c.x,C=v.y-a.m_sweep.c.y,J=v.x-c.m_sweep.c.x;v=v.y-c.m_sweep.c.y;o=o<t?o:t;t=
R.Clamp(j*(t+O.b2_linearSlop),-O.b2_maxLinearCorrection,0);t=-s.equalizedMass*t;s=t*m.x;t=t*m.y;a.m_sweep.c.x-=g*s;a.m_sweep.c.y-=g*t;a.m_sweep.a-=b*(x*t-C*s);a.SynchronizeTransform();c.m_sweep.c.x+=e*s;c.m_sweep.c.y+=e*t;c.m_sweep.a+=f*(J*t-v*s);c.SynchronizeTransform()}}return o>-1.5*O.b2_linearSlop};Box2D.postDefs.push(function(){Box2D.Dynamics.Contacts.b2ContactSolver.s_worldManifold=new l;Box2D.Dynamics.Contacts.b2ContactSolver.s_psm=new u});Box2D.inherit(I,Box2D.Dynamics.Contacts.b2Contact);
I.prototype.__super=Box2D.Dynamics.Contacts.b2Contact.prototype;I.b2EdgeAndCircleContact=function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};I.Create=function(){return new I};I.Destroy=function(){};I.prototype.Reset=function(j,o){this.__super.Reset.call(this,j,o)};I.prototype.Evaluate=function(){var j=this.m_fixtureA.GetBody(),o=this.m_fixtureB.GetBody();this.b2CollideEdgeAndCircle(this.m_manifold,this.m_fixtureA.GetShape()instanceof G?this.m_fixtureA.GetShape():null,j.m_xf,
this.m_fixtureB.GetShape()instanceof F?this.m_fixtureB.GetShape():null,o.m_xf)};I.prototype.b2CollideEdgeAndCircle=function(){};Box2D.inherit(W,Box2D.Dynamics.Contacts.b2Contact);W.prototype.__super=Box2D.Dynamics.Contacts.b2Contact.prototype;W.b2NullContact=function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};W.prototype.b2NullContact=function(){this.__super.b2Contact.call(this)};W.prototype.Evaluate=function(){};Box2D.inherit(Y,Box2D.Dynamics.Contacts.b2Contact);Y.prototype.__super=
Box2D.Dynamics.Contacts.b2Contact.prototype;Y.b2PolyAndCircleContact=function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};Y.Create=function(){return new Y};Y.Destroy=function(){};Y.prototype.Reset=function(j,o){this.__super.Reset.call(this,j,o);O.b2Assert(j.GetType()==y.e_polygonShape);O.b2Assert(o.GetType()==y.e_circleShape)};Y.prototype.Evaluate=function(){var j=this.m_fixtureA.m_body,o=this.m_fixtureB.m_body;S.CollidePolygonAndCircle(this.m_manifold,this.m_fixtureA.GetShape()instanceof
K?this.m_fixtureA.GetShape():null,j.m_xf,this.m_fixtureB.GetShape()instanceof F?this.m_fixtureB.GetShape():null,o.m_xf)};Box2D.inherit(k,Box2D.Dynamics.Contacts.b2Contact);k.prototype.__super=Box2D.Dynamics.Contacts.b2Contact.prototype;k.b2PolyAndEdgeContact=function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};k.Create=function(){return new k};k.Destroy=function(){};k.prototype.Reset=function(j,o){this.__super.Reset.call(this,j,o);O.b2Assert(j.GetType()==y.e_polygonShape);
O.b2Assert(o.GetType()==y.e_edgeShape)};k.prototype.Evaluate=function(){var j=this.m_fixtureA.GetBody(),o=this.m_fixtureB.GetBody();this.b2CollidePolyAndEdge(this.m_manifold,this.m_fixtureA.GetShape()instanceof K?this.m_fixtureA.GetShape():null,j.m_xf,this.m_fixtureB.GetShape()instanceof G?this.m_fixtureB.GetShape():null,o.m_xf)};k.prototype.b2CollidePolyAndEdge=function(){};Box2D.inherit(z,Box2D.Dynamics.Contacts.b2Contact);z.prototype.__super=Box2D.Dynamics.Contacts.b2Contact.prototype;z.b2PolygonContact=
function(){Box2D.Dynamics.Contacts.b2Contact.b2Contact.apply(this,arguments)};z.Create=function(){return new z};z.Destroy=function(){};z.prototype.Reset=function(j,o){this.__super.Reset.call(this,j,o)};z.prototype.Evaluate=function(){var j=this.m_fixtureA.GetBody(),o=this.m_fixtureB.GetBody();S.CollidePolygons(this.m_manifold,this.m_fixtureA.GetShape()instanceof K?this.m_fixtureA.GetShape():null,j.m_xf,this.m_fixtureB.GetShape()instanceof K?this.m_fixtureB.GetShape():null,o.m_xf)};u.b2PositionSolverManifold=
function(){};u.prototype.b2PositionSolverManifold=function(){this.m_normal=new N;this.m_separations=new Vector_a2j_Number(O.b2_maxManifoldPoints);this.m_points=new Vector(O.b2_maxManifoldPoints);for(var j=0;j<O.b2_maxManifoldPoints;j++)this.m_points[j]=new N};u.prototype.Initialize=function(j){O.b2Assert(j.pointCount>0);var o=0,q=0,n=0,a,c=0,g=0;switch(j.type){case Z.e_circles:a=j.bodyA.m_xf.R;n=j.localPoint;o=j.bodyA.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);q=j.bodyA.m_xf.position.y+(a.col1.y*
n.x+a.col2.y*n.y);a=j.bodyB.m_xf.R;n=j.points[0].localPoint;c=j.bodyB.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);a=j.bodyB.m_xf.position.y+(a.col1.y*n.x+a.col2.y*n.y);n=c-o;g=a-q;var b=n*n+g*g;if(b>Number.MIN_VALUE*Number.MIN_VALUE){b=Math.sqrt(b);this.m_normal.x=n/b;this.m_normal.y=g/b}else{this.m_normal.x=1;this.m_normal.y=0}this.m_points[0].x=0.5*(o+c);this.m_points[0].y=0.5*(q+a);this.m_separations[0]=n*this.m_normal.x+g*this.m_normal.y-j.radius;break;case Z.e_faceA:a=j.bodyA.m_xf.R;n=j.localPlaneNormal;
this.m_normal.x=a.col1.x*n.x+a.col2.x*n.y;this.m_normal.y=a.col1.y*n.x+a.col2.y*n.y;a=j.bodyA.m_xf.R;n=j.localPoint;c=j.bodyA.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);g=j.bodyA.m_xf.position.y+(a.col1.y*n.x+a.col2.y*n.y);a=j.bodyB.m_xf.R;for(o=0;o<j.pointCount;++o){n=j.points[o].localPoint;q=j.bodyB.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);n=j.bodyB.m_xf.position.y+(a.col1.y*n.x+a.col2.y*n.y);this.m_separations[o]=(q-c)*this.m_normal.x+(n-g)*this.m_normal.y-j.radius;this.m_points[o].x=q;this.m_points[o].y=
n}break;case Z.e_faceB:a=j.bodyB.m_xf.R;n=j.localPlaneNormal;this.m_normal.x=a.col1.x*n.x+a.col2.x*n.y;this.m_normal.y=a.col1.y*n.x+a.col2.y*n.y;a=j.bodyB.m_xf.R;n=j.localPoint;c=j.bodyB.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);g=j.bodyB.m_xf.position.y+(a.col1.y*n.x+a.col2.y*n.y);a=j.bodyA.m_xf.R;for(o=0;o<j.pointCount;++o){n=j.points[o].localPoint;q=j.bodyA.m_xf.position.x+(a.col1.x*n.x+a.col2.x*n.y);n=j.bodyA.m_xf.position.y+(a.col1.y*n.x+a.col2.y*n.y);this.m_separations[o]=(q-c)*this.m_normal.x+
(n-g)*this.m_normal.y-j.radius;this.m_points[o].Set(q,n)}this.m_normal.x*=-1;this.m_normal.y*=-1}};Box2D.postDefs.push(function(){Box2D.Dynamics.Contacts.b2PositionSolverManifold.circlePointA=new N;Box2D.Dynamics.Contacts.b2PositionSolverManifold.circlePointB=new N})})();
(function(){var F=Box2D.Common.Math.b2Mat22,G=Box2D.Common.Math.b2Math,K=Box2D.Common.Math.b2Vec2,y=Box2D.Common.b2Color,w=Box2D.Dynamics.Controllers.b2BuoyancyController,A=Box2D.Dynamics.Controllers.b2ConstantAccelController,U=Box2D.Dynamics.Controllers.b2ConstantForceController,p=Box2D.Dynamics.Controllers.b2Controller,B=Box2D.Dynamics.Controllers.b2ControllerEdge,Q=Box2D.Dynamics.Controllers.b2GravityController,V=Box2D.Dynamics.Controllers.b2TensorDampingController;Box2D.inherit(w,Box2D.Dynamics.Controllers.b2Controller);
w.prototype.__super=Box2D.Dynamics.Controllers.b2Controller.prototype;w.b2BuoyancyController=function(){Box2D.Dynamics.Controllers.b2Controller.b2Controller.apply(this,arguments);this.normal=new K(0,-1);this.density=this.offset=0;this.velocity=new K(0,0);this.linearDrag=2;this.angularDrag=1;this.useDensity=false;this.useWorldGravity=true;this.gravity=null};w.prototype.Step=function(){if(this.m_bodyList){if(this.useWorldGravity)this.gravity=this.GetWorld().GetGravity().Copy();for(var M=this.m_bodyList;M;M=
M.nextBody){var L=M.body;if(L.IsAwake()!=false){for(var I=new K,W=new K,Y=0,k=0,z=L.GetFixtureList();z;z=z.GetNext()){var u=new K,D=z.GetShape().ComputeSubmergedArea(this.normal,this.offset,L.GetTransform(),u);Y+=D;I.x+=D*u.x;I.y+=D*u.y;var H=0;H=1;k+=D*H;W.x+=D*u.x*H;W.y+=D*u.y*H}I.x/=Y;I.y/=Y;W.x/=k;W.y/=k;if(!(Y<Number.MIN_VALUE)){k=this.gravity.GetNegative();k.Multiply(this.density*Y);L.ApplyForce(k,W);W=L.GetLinearVelocityFromWorldPoint(I);W.Subtract(this.velocity);W.Multiply(-this.linearDrag*
Y);L.ApplyForce(W,I);L.ApplyTorque(-L.GetInertia()/L.GetMass()*Y*L.GetAngularVelocity()*this.angularDrag)}}}}};w.prototype.Draw=function(M){var L=new K,I=new K;L.x=this.normal.x*this.offset+this.normal.y*1E3;L.y=this.normal.y*this.offset-this.normal.x*1E3;I.x=this.normal.x*this.offset-this.normal.y*1E3;I.y=this.normal.y*this.offset+this.normal.x*1E3;var W=new y(0,0,1);M.DrawSegment(L,I,W)};Box2D.inherit(A,Box2D.Dynamics.Controllers.b2Controller);A.prototype.__super=Box2D.Dynamics.Controllers.b2Controller.prototype;
A.b2ConstantAccelController=function(){Box2D.Dynamics.Controllers.b2Controller.b2Controller.apply(this,arguments);this.A=new K(0,0)};A.prototype.Step=function(M){M=new K(this.A.x*M.dt,this.A.y*M.dt);for(var L=this.m_bodyList;L;L=L.nextBody){var I=L.body;I.IsAwake()&&I.SetLinearVelocity(new K(I.GetLinearVelocity().x+M.x,I.GetLinearVelocity().y+M.y))}};Box2D.inherit(U,Box2D.Dynamics.Controllers.b2Controller);U.prototype.__super=Box2D.Dynamics.Controllers.b2Controller.prototype;U.b2ConstantForceController=
function(){Box2D.Dynamics.Controllers.b2Controller.b2Controller.apply(this,arguments);this.F=new K(0,0)};U.prototype.Step=function(){for(var M=this.m_bodyList;M;M=M.nextBody){var L=M.body;L.IsAwake()&&L.ApplyForce(this.F,L.GetWorldCenter())}};p.b2Controller=function(){};p.prototype.Step=function(){};p.prototype.Draw=function(){};p.prototype.AddBody=function(M){var L=new B;L.controller=this;L.body=M;L.nextBody=this.m_bodyList;L.prevBody=null;this.m_bodyList=L;if(L.nextBody)L.nextBody.prevBody=L;this.m_bodyCount++;
L.nextController=M.m_controllerList;L.prevController=null;M.m_controllerList=L;if(L.nextController)L.nextController.prevController=L;M.m_controllerCount++};p.prototype.RemoveBody=function(M){for(var L=M.m_controllerList;L&&L.controller!=this;)L=L.nextController;if(L.prevBody)L.prevBody.nextBody=L.nextBody;if(L.nextBody)L.nextBody.prevBody=L.prevBody;if(L.nextController)L.nextController.prevController=L.prevController;if(L.prevController)L.prevController.nextController=L.nextController;if(this.m_bodyList==
L)this.m_bodyList=L.nextBody;if(M.m_controllerList==L)M.m_controllerList=L.nextController;M.m_controllerCount--;this.m_bodyCount--};p.prototype.Clear=function(){for(;this.m_bodyList;)this.RemoveBody(this.m_bodyList.body)};p.prototype.GetNext=function(){return this.m_next};p.prototype.GetWorld=function(){return this.m_world};p.prototype.GetBodyList=function(){return this.m_bodyList};B.b2ControllerEdge=function(){};Box2D.inherit(Q,Box2D.Dynamics.Controllers.b2Controller);Q.prototype.__super=Box2D.Dynamics.Controllers.b2Controller.prototype;
Q.b2GravityController=function(){Box2D.Dynamics.Controllers.b2Controller.b2Controller.apply(this,arguments);this.G=1;this.invSqr=true};Q.prototype.Step=function(){var M=null,L=null,I=null,W=0,Y=null,k=null,z=null,u=0,D=0,H=0;u=null;if(this.invSqr)for(M=this.m_bodyList;M;M=M.nextBody){L=M.body;I=L.GetWorldCenter();W=L.GetMass();for(Y=this.m_bodyList;Y!=M;Y=Y.nextBody){k=Y.body;z=k.GetWorldCenter();u=z.x-I.x;D=z.y-I.y;H=u*u+D*D;if(!(H<Number.MIN_VALUE)){u=new K(u,D);u.Multiply(this.G/H/Math.sqrt(H)*
W*k.GetMass());L.IsAwake()&&L.ApplyForce(u,I);u.Multiply(-1);k.IsAwake()&&k.ApplyForce(u,z)}}}else for(M=this.m_bodyList;M;M=M.nextBody){L=M.body;I=L.GetWorldCenter();W=L.GetMass();for(Y=this.m_bodyList;Y!=M;Y=Y.nextBody){k=Y.body;z=k.GetWorldCenter();u=z.x-I.x;D=z.y-I.y;H=u*u+D*D;if(!(H<Number.MIN_VALUE)){u=new K(u,D);u.Multiply(this.G/H*W*k.GetMass());L.IsAwake()&&L.ApplyForce(u,I);u.Multiply(-1);k.IsAwake()&&k.ApplyForce(u,z)}}}};Box2D.inherit(V,Box2D.Dynamics.Controllers.b2Controller);V.prototype.__super=
Box2D.Dynamics.Controllers.b2Controller.prototype;V.b2TensorDampingController=function(){Box2D.Dynamics.Controllers.b2Controller.b2Controller.apply(this,arguments);this.T=new F;this.maxTimestep=0};V.prototype.SetAxisAligned=function(M,L){if(M===undefined)M=0;if(L===undefined)L=0;this.T.col1.x=-M;this.T.col1.y=0;this.T.col2.x=0;this.T.col2.y=-L;this.maxTimestep=M>0||L>0?1/Math.max(M,L):0};V.prototype.Step=function(M){M=M.dt;if(!(M<=Number.MIN_VALUE)){if(M>this.maxTimestep&&this.maxTimestep>0)M=this.maxTimestep;
for(var L=this.m_bodyList;L;L=L.nextBody){var I=L.body;if(I.IsAwake()){var W=I.GetWorldVector(G.MulMV(this.T,I.GetLocalVector(I.GetLinearVelocity())));I.SetLinearVelocity(new K(I.GetLinearVelocity().x+W.x*M,I.GetLinearVelocity().y+W.y*M))}}}}})();
(function(){var F=Box2D.Common.b2Settings,G=Box2D.Common.Math.b2Mat22,K=Box2D.Common.Math.b2Mat33,y=Box2D.Common.Math.b2Math,w=Box2D.Common.Math.b2Vec2,A=Box2D.Common.Math.b2Vec3,U=Box2D.Dynamics.Joints.b2DistanceJoint,p=Box2D.Dynamics.Joints.b2DistanceJointDef,B=Box2D.Dynamics.Joints.b2FrictionJoint,Q=Box2D.Dynamics.Joints.b2FrictionJointDef,V=Box2D.Dynamics.Joints.b2GearJoint,M=Box2D.Dynamics.Joints.b2GearJointDef,L=Box2D.Dynamics.Joints.b2Jacobian,I=Box2D.Dynamics.Joints.b2Joint,W=Box2D.Dynamics.Joints.b2JointDef,
Y=Box2D.Dynamics.Joints.b2JointEdge,k=Box2D.Dynamics.Joints.b2LineJoint,z=Box2D.Dynamics.Joints.b2LineJointDef,u=Box2D.Dynamics.Joints.b2MouseJoint,D=Box2D.Dynamics.Joints.b2MouseJointDef,H=Box2D.Dynamics.Joints.b2PrismaticJoint,O=Box2D.Dynamics.Joints.b2PrismaticJointDef,E=Box2D.Dynamics.Joints.b2PulleyJoint,R=Box2D.Dynamics.Joints.b2PulleyJointDef,N=Box2D.Dynamics.Joints.b2RevoluteJoint,S=Box2D.Dynamics.Joints.b2RevoluteJointDef,aa=Box2D.Dynamics.Joints.b2WeldJoint,Z=Box2D.Dynamics.Joints.b2WeldJointDef;
Box2D.inherit(U,Box2D.Dynamics.Joints.b2Joint);U.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;U.b2DistanceJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_u=new w};U.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};U.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};U.prototype.GetReactionForce=function(d){if(d===undefined)d=
0;return new w(d*this.m_impulse*this.m_u.x,d*this.m_impulse*this.m_u.y)};U.prototype.GetReactionTorque=function(){return 0};U.prototype.GetLength=function(){return this.m_length};U.prototype.SetLength=function(d){if(d===undefined)d=0;this.m_length=d};U.prototype.GetFrequency=function(){return this.m_frequencyHz};U.prototype.SetFrequency=function(d){if(d===undefined)d=0;this.m_frequencyHz=d};U.prototype.GetDampingRatio=function(){return this.m_dampingRatio};U.prototype.SetDampingRatio=function(d){if(d===
undefined)d=0;this.m_dampingRatio=d};U.prototype.b2DistanceJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchor1.SetV(d.localAnchorA);this.m_localAnchor2.SetV(d.localAnchorB);this.m_length=d.length;this.m_frequencyHz=d.frequencyHz;this.m_dampingRatio=d.dampingRatio;this.m_bias=this.m_gamma=this.m_impulse=0};U.prototype.InitVelocityConstraints=function(d){var h,l=0,j=this.m_bodyA,o=this.m_bodyB;h=j.m_xf.R;var q=this.m_localAnchor1.x-j.m_sweep.localCenter.x,n=this.m_localAnchor1.y-
j.m_sweep.localCenter.y;l=h.col1.x*q+h.col2.x*n;n=h.col1.y*q+h.col2.y*n;q=l;h=o.m_xf.R;var a=this.m_localAnchor2.x-o.m_sweep.localCenter.x,c=this.m_localAnchor2.y-o.m_sweep.localCenter.y;l=h.col1.x*a+h.col2.x*c;c=h.col1.y*a+h.col2.y*c;a=l;this.m_u.x=o.m_sweep.c.x+a-j.m_sweep.c.x-q;this.m_u.y=o.m_sweep.c.y+c-j.m_sweep.c.y-n;l=Math.sqrt(this.m_u.x*this.m_u.x+this.m_u.y*this.m_u.y);l>F.b2_linearSlop?this.m_u.Multiply(1/l):this.m_u.SetZero();h=q*this.m_u.y-n*this.m_u.x;var g=a*this.m_u.y-c*this.m_u.x;
h=j.m_invMass+j.m_invI*h*h+o.m_invMass+o.m_invI*g*g;this.m_mass=h!=0?1/h:0;if(this.m_frequencyHz>0){l=l-this.m_length;g=2*Math.PI*this.m_frequencyHz;var b=this.m_mass*g*g;this.m_gamma=d.dt*(2*this.m_mass*this.m_dampingRatio*g+d.dt*b);this.m_gamma=this.m_gamma!=0?1/this.m_gamma:0;this.m_bias=l*d.dt*b*this.m_gamma;this.m_mass=h+this.m_gamma;this.m_mass=this.m_mass!=0?1/this.m_mass:0}if(d.warmStarting){this.m_impulse*=d.dtRatio;d=this.m_impulse*this.m_u.x;h=this.m_impulse*this.m_u.y;j.m_linearVelocity.x-=
j.m_invMass*d;j.m_linearVelocity.y-=j.m_invMass*h;j.m_angularVelocity-=j.m_invI*(q*h-n*d);o.m_linearVelocity.x+=o.m_invMass*d;o.m_linearVelocity.y+=o.m_invMass*h;o.m_angularVelocity+=o.m_invI*(a*h-c*d)}else this.m_impulse=0};U.prototype.SolveVelocityConstraints=function(){var d,h=this.m_bodyA,l=this.m_bodyB;d=h.m_xf.R;var j=this.m_localAnchor1.x-h.m_sweep.localCenter.x,o=this.m_localAnchor1.y-h.m_sweep.localCenter.y,q=d.col1.x*j+d.col2.x*o;o=d.col1.y*j+d.col2.y*o;j=q;d=l.m_xf.R;var n=this.m_localAnchor2.x-
l.m_sweep.localCenter.x,a=this.m_localAnchor2.y-l.m_sweep.localCenter.y;q=d.col1.x*n+d.col2.x*a;a=d.col1.y*n+d.col2.y*a;n=q;q=-this.m_mass*(this.m_u.x*(l.m_linearVelocity.x+-l.m_angularVelocity*a-(h.m_linearVelocity.x+-h.m_angularVelocity*o))+this.m_u.y*(l.m_linearVelocity.y+l.m_angularVelocity*n-(h.m_linearVelocity.y+h.m_angularVelocity*j))+this.m_bias+this.m_gamma*this.m_impulse);this.m_impulse+=q;d=q*this.m_u.x;q=q*this.m_u.y;h.m_linearVelocity.x-=h.m_invMass*d;h.m_linearVelocity.y-=h.m_invMass*
q;h.m_angularVelocity-=h.m_invI*(j*q-o*d);l.m_linearVelocity.x+=l.m_invMass*d;l.m_linearVelocity.y+=l.m_invMass*q;l.m_angularVelocity+=l.m_invI*(n*q-a*d)};U.prototype.SolvePositionConstraints=function(){var d;if(this.m_frequencyHz>0)return true;var h=this.m_bodyA,l=this.m_bodyB;d=h.m_xf.R;var j=this.m_localAnchor1.x-h.m_sweep.localCenter.x,o=this.m_localAnchor1.y-h.m_sweep.localCenter.y,q=d.col1.x*j+d.col2.x*o;o=d.col1.y*j+d.col2.y*o;j=q;d=l.m_xf.R;var n=this.m_localAnchor2.x-l.m_sweep.localCenter.x,
a=this.m_localAnchor2.y-l.m_sweep.localCenter.y;q=d.col1.x*n+d.col2.x*a;a=d.col1.y*n+d.col2.y*a;n=q;q=l.m_sweep.c.x+n-h.m_sweep.c.x-j;var c=l.m_sweep.c.y+a-h.m_sweep.c.y-o;d=Math.sqrt(q*q+c*c);q/=d;c/=d;d=d-this.m_length;d=y.Clamp(d,-F.b2_maxLinearCorrection,F.b2_maxLinearCorrection);var g=-this.m_mass*d;this.m_u.Set(q,c);q=g*this.m_u.x;c=g*this.m_u.y;h.m_sweep.c.x-=h.m_invMass*q;h.m_sweep.c.y-=h.m_invMass*c;h.m_sweep.a-=h.m_invI*(j*c-o*q);l.m_sweep.c.x+=l.m_invMass*q;l.m_sweep.c.y+=l.m_invMass*c;
l.m_sweep.a+=l.m_invI*(n*c-a*q);h.SynchronizeTransform();l.SynchronizeTransform();return y.Abs(d)<F.b2_linearSlop};Box2D.inherit(p,Box2D.Dynamics.Joints.b2JointDef);p.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;p.b2DistanceJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=new w;this.localAnchorB=new w};p.prototype.b2DistanceJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_distanceJoint;this.length=1;this.dampingRatio=
this.frequencyHz=0};p.prototype.Initialize=function(d,h,l,j){this.bodyA=d;this.bodyB=h;this.localAnchorA.SetV(this.bodyA.GetLocalPoint(l));this.localAnchorB.SetV(this.bodyB.GetLocalPoint(j));d=j.x-l.x;l=j.y-l.y;this.length=Math.sqrt(d*d+l*l);this.dampingRatio=this.frequencyHz=0};Box2D.inherit(B,Box2D.Dynamics.Joints.b2Joint);B.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;B.b2FrictionJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_localAnchorA=new w;
this.m_localAnchorB=new w;this.m_linearMass=new G;this.m_linearImpulse=new w};B.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchorA)};B.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchorB)};B.prototype.GetReactionForce=function(d){if(d===undefined)d=0;return new w(d*this.m_linearImpulse.x,d*this.m_linearImpulse.y)};B.prototype.GetReactionTorque=function(d){if(d===undefined)d=0;return d*this.m_angularImpulse};B.prototype.SetMaxForce=
function(d){if(d===undefined)d=0;this.m_maxForce=d};B.prototype.GetMaxForce=function(){return this.m_maxForce};B.prototype.SetMaxTorque=function(d){if(d===undefined)d=0;this.m_maxTorque=d};B.prototype.GetMaxTorque=function(){return this.m_maxTorque};B.prototype.b2FrictionJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchorA.SetV(d.localAnchorA);this.m_localAnchorB.SetV(d.localAnchorB);this.m_linearMass.SetZero();this.m_angularMass=0;this.m_linearImpulse.SetZero();this.m_angularImpulse=
0;this.m_maxForce=d.maxForce;this.m_maxTorque=d.maxTorque};B.prototype.InitVelocityConstraints=function(d){var h,l=0,j=this.m_bodyA,o=this.m_bodyB;h=j.m_xf.R;var q=this.m_localAnchorA.x-j.m_sweep.localCenter.x,n=this.m_localAnchorA.y-j.m_sweep.localCenter.y;l=h.col1.x*q+h.col2.x*n;n=h.col1.y*q+h.col2.y*n;q=l;h=o.m_xf.R;var a=this.m_localAnchorB.x-o.m_sweep.localCenter.x,c=this.m_localAnchorB.y-o.m_sweep.localCenter.y;l=h.col1.x*a+h.col2.x*c;c=h.col1.y*a+h.col2.y*c;a=l;h=j.m_invMass;l=o.m_invMass;
var g=j.m_invI,b=o.m_invI,e=new G;e.col1.x=h+l;e.col2.x=0;e.col1.y=0;e.col2.y=h+l;e.col1.x+=g*n*n;e.col2.x+=-g*q*n;e.col1.y+=-g*q*n;e.col2.y+=g*q*q;e.col1.x+=b*c*c;e.col2.x+=-b*a*c;e.col1.y+=-b*a*c;e.col2.y+=b*a*a;e.GetInverse(this.m_linearMass);this.m_angularMass=g+b;if(this.m_angularMass>0)this.m_angularMass=1/this.m_angularMass;if(d.warmStarting){this.m_linearImpulse.x*=d.dtRatio;this.m_linearImpulse.y*=d.dtRatio;this.m_angularImpulse*=d.dtRatio;d=this.m_linearImpulse;j.m_linearVelocity.x-=h*d.x;
j.m_linearVelocity.y-=h*d.y;j.m_angularVelocity-=g*(q*d.y-n*d.x+this.m_angularImpulse);o.m_linearVelocity.x+=l*d.x;o.m_linearVelocity.y+=l*d.y;o.m_angularVelocity+=b*(a*d.y-c*d.x+this.m_angularImpulse)}else{this.m_linearImpulse.SetZero();this.m_angularImpulse=0}};B.prototype.SolveVelocityConstraints=function(d){var h,l=0,j=this.m_bodyA,o=this.m_bodyB,q=j.m_linearVelocity,n=j.m_angularVelocity,a=o.m_linearVelocity,c=o.m_angularVelocity,g=j.m_invMass,b=o.m_invMass,e=j.m_invI,f=o.m_invI;h=j.m_xf.R;var m=
this.m_localAnchorA.x-j.m_sweep.localCenter.x,r=this.m_localAnchorA.y-j.m_sweep.localCenter.y;l=h.col1.x*m+h.col2.x*r;r=h.col1.y*m+h.col2.y*r;m=l;h=o.m_xf.R;var s=this.m_localAnchorB.x-o.m_sweep.localCenter.x,v=this.m_localAnchorB.y-o.m_sweep.localCenter.y;l=h.col1.x*s+h.col2.x*v;v=h.col1.y*s+h.col2.y*v;s=l;h=0;l=-this.m_angularMass*(c-n);var t=this.m_angularImpulse;h=d.dt*this.m_maxTorque;this.m_angularImpulse=y.Clamp(this.m_angularImpulse+l,-h,h);l=this.m_angularImpulse-t;n-=e*l;c+=f*l;h=y.MulMV(this.m_linearMass,
new w(-(a.x-c*v-q.x+n*r),-(a.y+c*s-q.y-n*m)));l=this.m_linearImpulse.Copy();this.m_linearImpulse.Add(h);h=d.dt*this.m_maxForce;if(this.m_linearImpulse.LengthSquared()>h*h){this.m_linearImpulse.Normalize();this.m_linearImpulse.Multiply(h)}h=y.SubtractVV(this.m_linearImpulse,l);q.x-=g*h.x;q.y-=g*h.y;n-=e*(m*h.y-r*h.x);a.x+=b*h.x;a.y+=b*h.y;c+=f*(s*h.y-v*h.x);j.m_angularVelocity=n;o.m_angularVelocity=c};B.prototype.SolvePositionConstraints=function(){return true};Box2D.inherit(Q,Box2D.Dynamics.Joints.b2JointDef);
Q.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;Q.b2FrictionJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=new w;this.localAnchorB=new w};Q.prototype.b2FrictionJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_frictionJoint;this.maxTorque=this.maxForce=0};Q.prototype.Initialize=function(d,h,l){this.bodyA=d;this.bodyB=h;this.localAnchorA.SetV(this.bodyA.GetLocalPoint(l));this.localAnchorB.SetV(this.bodyB.GetLocalPoint(l))};
Box2D.inherit(V,Box2D.Dynamics.Joints.b2Joint);V.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;V.b2GearJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_groundAnchor1=new w;this.m_groundAnchor2=new w;this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_J=new L};V.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};V.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};V.prototype.GetReactionForce=
function(d){if(d===undefined)d=0;return new w(d*this.m_impulse*this.m_J.linearB.x,d*this.m_impulse*this.m_J.linearB.y)};V.prototype.GetReactionTorque=function(d){if(d===undefined)d=0;var h=this.m_bodyB.m_xf.R,l=this.m_localAnchor1.x-this.m_bodyB.m_sweep.localCenter.x,j=this.m_localAnchor1.y-this.m_bodyB.m_sweep.localCenter.y,o=h.col1.x*l+h.col2.x*j;j=h.col1.y*l+h.col2.y*j;l=o;return d*(this.m_impulse*this.m_J.angularB-l*this.m_impulse*this.m_J.linearB.y+j*this.m_impulse*this.m_J.linearB.x)};V.prototype.GetRatio=
function(){return this.m_ratio};V.prototype.SetRatio=function(d){if(d===undefined)d=0;this.m_ratio=d};V.prototype.b2GearJoint=function(d){this.__super.b2Joint.call(this,d);var h=parseInt(d.joint1.m_type),l=parseInt(d.joint2.m_type);this.m_prismatic2=this.m_revolute2=this.m_prismatic1=this.m_revolute1=null;var j=0,o=0;this.m_ground1=d.joint1.GetBodyA();this.m_bodyA=d.joint1.GetBodyB();if(h==I.e_revoluteJoint){this.m_revolute1=d.joint1 instanceof N?d.joint1:null;this.m_groundAnchor1.SetV(this.m_revolute1.m_localAnchor1);
this.m_localAnchor1.SetV(this.m_revolute1.m_localAnchor2);j=this.m_revolute1.GetJointAngle()}else{this.m_prismatic1=d.joint1 instanceof H?d.joint1:null;this.m_groundAnchor1.SetV(this.m_prismatic1.m_localAnchor1);this.m_localAnchor1.SetV(this.m_prismatic1.m_localAnchor2);j=this.m_prismatic1.GetJointTranslation()}this.m_ground2=d.joint2.GetBodyA();this.m_bodyB=d.joint2.GetBodyB();if(l==I.e_revoluteJoint){this.m_revolute2=d.joint2 instanceof N?d.joint2:null;this.m_groundAnchor2.SetV(this.m_revolute2.m_localAnchor1);
this.m_localAnchor2.SetV(this.m_revolute2.m_localAnchor2);o=this.m_revolute2.GetJointAngle()}else{this.m_prismatic2=d.joint2 instanceof H?d.joint2:null;this.m_groundAnchor2.SetV(this.m_prismatic2.m_localAnchor1);this.m_localAnchor2.SetV(this.m_prismatic2.m_localAnchor2);o=this.m_prismatic2.GetJointTranslation()}this.m_ratio=d.ratio;this.m_constant=j+this.m_ratio*o;this.m_impulse=0};V.prototype.InitVelocityConstraints=function(d){var h=this.m_ground1,l=this.m_ground2,j=this.m_bodyA,o=this.m_bodyB,
q=0,n=0,a=0,c=0,g=a=0,b=0;this.m_J.SetZero();if(this.m_revolute1){this.m_J.angularA=-1;b+=j.m_invI}else{h=h.m_xf.R;n=this.m_prismatic1.m_localXAxis1;q=h.col1.x*n.x+h.col2.x*n.y;n=h.col1.y*n.x+h.col2.y*n.y;h=j.m_xf.R;a=this.m_localAnchor1.x-j.m_sweep.localCenter.x;c=this.m_localAnchor1.y-j.m_sweep.localCenter.y;g=h.col1.x*a+h.col2.x*c;c=h.col1.y*a+h.col2.y*c;a=g;a=a*n-c*q;this.m_J.linearA.Set(-q,-n);this.m_J.angularA=-a;b+=j.m_invMass+j.m_invI*a*a}if(this.m_revolute2){this.m_J.angularB=-this.m_ratio;
b+=this.m_ratio*this.m_ratio*o.m_invI}else{h=l.m_xf.R;n=this.m_prismatic2.m_localXAxis1;q=h.col1.x*n.x+h.col2.x*n.y;n=h.col1.y*n.x+h.col2.y*n.y;h=o.m_xf.R;a=this.m_localAnchor2.x-o.m_sweep.localCenter.x;c=this.m_localAnchor2.y-o.m_sweep.localCenter.y;g=h.col1.x*a+h.col2.x*c;c=h.col1.y*a+h.col2.y*c;a=g;a=a*n-c*q;this.m_J.linearB.Set(-this.m_ratio*q,-this.m_ratio*n);this.m_J.angularB=-this.m_ratio*a;b+=this.m_ratio*this.m_ratio*(o.m_invMass+o.m_invI*a*a)}this.m_mass=b>0?1/b:0;if(d.warmStarting){j.m_linearVelocity.x+=
j.m_invMass*this.m_impulse*this.m_J.linearA.x;j.m_linearVelocity.y+=j.m_invMass*this.m_impulse*this.m_J.linearA.y;j.m_angularVelocity+=j.m_invI*this.m_impulse*this.m_J.angularA;o.m_linearVelocity.x+=o.m_invMass*this.m_impulse*this.m_J.linearB.x;o.m_linearVelocity.y+=o.m_invMass*this.m_impulse*this.m_J.linearB.y;o.m_angularVelocity+=o.m_invI*this.m_impulse*this.m_J.angularB}else this.m_impulse=0};V.prototype.SolveVelocityConstraints=function(){var d=this.m_bodyA,h=this.m_bodyB,l=-this.m_mass*this.m_J.Compute(d.m_linearVelocity,
d.m_angularVelocity,h.m_linearVelocity,h.m_angularVelocity);this.m_impulse+=l;d.m_linearVelocity.x+=d.m_invMass*l*this.m_J.linearA.x;d.m_linearVelocity.y+=d.m_invMass*l*this.m_J.linearA.y;d.m_angularVelocity+=d.m_invI*l*this.m_J.angularA;h.m_linearVelocity.x+=h.m_invMass*l*this.m_J.linearB.x;h.m_linearVelocity.y+=h.m_invMass*l*this.m_J.linearB.y;h.m_angularVelocity+=h.m_invI*l*this.m_J.angularB};V.prototype.SolvePositionConstraints=function(){var d=this.m_bodyA,h=this.m_bodyB,l=0,j=0;l=this.m_revolute1?
this.m_revolute1.GetJointAngle():this.m_prismatic1.GetJointTranslation();j=this.m_revolute2?this.m_revolute2.GetJointAngle():this.m_prismatic2.GetJointTranslation();l=-this.m_mass*(this.m_constant-(l+this.m_ratio*j));d.m_sweep.c.x+=d.m_invMass*l*this.m_J.linearA.x;d.m_sweep.c.y+=d.m_invMass*l*this.m_J.linearA.y;d.m_sweep.a+=d.m_invI*l*this.m_J.angularA;h.m_sweep.c.x+=h.m_invMass*l*this.m_J.linearB.x;h.m_sweep.c.y+=h.m_invMass*l*this.m_J.linearB.y;h.m_sweep.a+=h.m_invI*l*this.m_J.angularB;d.SynchronizeTransform();
h.SynchronizeTransform();return 0<F.b2_linearSlop};Box2D.inherit(M,Box2D.Dynamics.Joints.b2JointDef);M.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;M.b2GearJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments)};M.prototype.b2GearJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_gearJoint;this.joint2=this.joint1=null;this.ratio=1};L.b2Jacobian=function(){this.linearA=new w;this.linearB=new w};L.prototype.SetZero=function(){this.linearA.SetZero();
this.angularA=0;this.linearB.SetZero();this.angularB=0};L.prototype.Set=function(d,h,l,j){if(h===undefined)h=0;if(j===undefined)j=0;this.linearA.SetV(d);this.angularA=h;this.linearB.SetV(l);this.angularB=j};L.prototype.Compute=function(d,h,l,j){if(h===undefined)h=0;if(j===undefined)j=0;return this.linearA.x*d.x+this.linearA.y*d.y+this.angularA*h+(this.linearB.x*l.x+this.linearB.y*l.y)+this.angularB*j};I.b2Joint=function(){this.m_edgeA=new Y;this.m_edgeB=new Y;this.m_localCenterA=new w;this.m_localCenterB=
new w};I.prototype.GetType=function(){return this.m_type};I.prototype.GetAnchorA=function(){return null};I.prototype.GetAnchorB=function(){return null};I.prototype.GetReactionForce=function(){return null};I.prototype.GetReactionTorque=function(){return 0};I.prototype.GetBodyA=function(){return this.m_bodyA};I.prototype.GetBodyB=function(){return this.m_bodyB};I.prototype.GetNext=function(){return this.m_next};I.prototype.GetUserData=function(){return this.m_userData};I.prototype.SetUserData=function(d){this.m_userData=
d};I.prototype.IsActive=function(){return this.m_bodyA.IsActive()&&this.m_bodyB.IsActive()};I.Create=function(d){var h=null;switch(d.type){case I.e_distanceJoint:h=new U(d instanceof p?d:null);break;case I.e_mouseJoint:h=new u(d instanceof D?d:null);break;case I.e_prismaticJoint:h=new H(d instanceof O?d:null);break;case I.e_revoluteJoint:h=new N(d instanceof S?d:null);break;case I.e_pulleyJoint:h=new E(d instanceof R?d:null);break;case I.e_gearJoint:h=new V(d instanceof M?d:null);break;case I.e_lineJoint:h=
new k(d instanceof z?d:null);break;case I.e_weldJoint:h=new aa(d instanceof Z?d:null);break;case I.e_frictionJoint:h=new B(d instanceof Q?d:null)}return h};I.Destroy=function(){};I.prototype.b2Joint=function(d){F.b2Assert(d.bodyA!=d.bodyB);this.m_type=d.type;this.m_next=this.m_prev=null;this.m_bodyA=d.bodyA;this.m_bodyB=d.bodyB;this.m_collideConnected=d.collideConnected;this.m_islandFlag=false;this.m_userData=d.userData};I.prototype.InitVelocityConstraints=function(){};I.prototype.SolveVelocityConstraints=
function(){};I.prototype.FinalizeVelocityConstraints=function(){};I.prototype.SolvePositionConstraints=function(){return false};Box2D.postDefs.push(function(){Box2D.Dynamics.Joints.b2Joint.e_unknownJoint=0;Box2D.Dynamics.Joints.b2Joint.e_revoluteJoint=1;Box2D.Dynamics.Joints.b2Joint.e_prismaticJoint=2;Box2D.Dynamics.Joints.b2Joint.e_distanceJoint=3;Box2D.Dynamics.Joints.b2Joint.e_pulleyJoint=4;Box2D.Dynamics.Joints.b2Joint.e_mouseJoint=5;Box2D.Dynamics.Joints.b2Joint.e_gearJoint=6;Box2D.Dynamics.Joints.b2Joint.e_lineJoint=
7;Box2D.Dynamics.Joints.b2Joint.e_weldJoint=8;Box2D.Dynamics.Joints.b2Joint.e_frictionJoint=9;Box2D.Dynamics.Joints.b2Joint.e_inactiveLimit=0;Box2D.Dynamics.Joints.b2Joint.e_atLowerLimit=1;Box2D.Dynamics.Joints.b2Joint.e_atUpperLimit=2;Box2D.Dynamics.Joints.b2Joint.e_equalLimits=3});W.b2JointDef=function(){};W.prototype.b2JointDef=function(){this.type=I.e_unknownJoint;this.bodyB=this.bodyA=this.userData=null;this.collideConnected=false};Y.b2JointEdge=function(){};Box2D.inherit(k,Box2D.Dynamics.Joints.b2Joint);
k.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;k.b2LineJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_localXAxis1=new w;this.m_localYAxis1=new w;this.m_axis=new w;this.m_perp=new w;this.m_K=new G;this.m_impulse=new w};k.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};k.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};k.prototype.GetReactionForce=
function(d){if(d===undefined)d=0;return new w(d*(this.m_impulse.x*this.m_perp.x+(this.m_motorImpulse+this.m_impulse.y)*this.m_axis.x),d*(this.m_impulse.x*this.m_perp.y+(this.m_motorImpulse+this.m_impulse.y)*this.m_axis.y))};k.prototype.GetReactionTorque=function(d){if(d===undefined)d=0;return d*this.m_impulse.y};k.prototype.GetJointTranslation=function(){var d=this.m_bodyA,h=this.m_bodyB,l=d.GetWorldPoint(this.m_localAnchor1),j=h.GetWorldPoint(this.m_localAnchor2);h=j.x-l.x;l=j.y-l.y;d=d.GetWorldVector(this.m_localXAxis1);
return d.x*h+d.y*l};k.prototype.GetJointSpeed=function(){var d=this.m_bodyA,h=this.m_bodyB,l;l=d.m_xf.R;var j=this.m_localAnchor1.x-d.m_sweep.localCenter.x,o=this.m_localAnchor1.y-d.m_sweep.localCenter.y,q=l.col1.x*j+l.col2.x*o;o=l.col1.y*j+l.col2.y*o;j=q;l=h.m_xf.R;var n=this.m_localAnchor2.x-h.m_sweep.localCenter.x,a=this.m_localAnchor2.y-h.m_sweep.localCenter.y;q=l.col1.x*n+l.col2.x*a;a=l.col1.y*n+l.col2.y*a;n=q;l=h.m_sweep.c.x+n-(d.m_sweep.c.x+j);q=h.m_sweep.c.y+a-(d.m_sweep.c.y+o);var c=d.GetWorldVector(this.m_localXAxis1),
g=d.m_linearVelocity,b=h.m_linearVelocity;d=d.m_angularVelocity;h=h.m_angularVelocity;return l*-d*c.y+q*d*c.x+(c.x*(b.x+-h*a-g.x- -d*o)+c.y*(b.y+h*n-g.y-d*j))};k.prototype.IsLimitEnabled=function(){return this.m_enableLimit};k.prototype.EnableLimit=function(d){this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_enableLimit=d};k.prototype.GetLowerLimit=function(){return this.m_lowerTranslation};k.prototype.GetUpperLimit=function(){return this.m_upperTranslation};k.prototype.SetLimits=function(d,
h){if(d===undefined)d=0;if(h===undefined)h=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_lowerTranslation=d;this.m_upperTranslation=h};k.prototype.IsMotorEnabled=function(){return this.m_enableMotor};k.prototype.EnableMotor=function(d){this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_enableMotor=d};k.prototype.SetMotorSpeed=function(d){if(d===undefined)d=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_motorSpeed=d};k.prototype.GetMotorSpeed=function(){return this.m_motorSpeed};
k.prototype.SetMaxMotorForce=function(d){if(d===undefined)d=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_maxMotorForce=d};k.prototype.GetMaxMotorForce=function(){return this.m_maxMotorForce};k.prototype.GetMotorForce=function(){return this.m_motorImpulse};k.prototype.b2LineJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchor1.SetV(d.localAnchorA);this.m_localAnchor2.SetV(d.localAnchorB);this.m_localXAxis1.SetV(d.localAxisA);this.m_localYAxis1.x=-this.m_localXAxis1.y;
this.m_localYAxis1.y=this.m_localXAxis1.x;this.m_impulse.SetZero();this.m_motorImpulse=this.m_motorMass=0;this.m_lowerTranslation=d.lowerTranslation;this.m_upperTranslation=d.upperTranslation;this.m_maxMotorForce=d.maxMotorForce;this.m_motorSpeed=d.motorSpeed;this.m_enableLimit=d.enableLimit;this.m_enableMotor=d.enableMotor;this.m_limitState=I.e_inactiveLimit;this.m_axis.SetZero();this.m_perp.SetZero()};k.prototype.InitVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j,o=0;this.m_localCenterA.SetV(h.GetLocalCenter());
this.m_localCenterB.SetV(l.GetLocalCenter());var q=h.GetTransform();l.GetTransform();j=h.m_xf.R;var n=this.m_localAnchor1.x-this.m_localCenterA.x,a=this.m_localAnchor1.y-this.m_localCenterA.y;o=j.col1.x*n+j.col2.x*a;a=j.col1.y*n+j.col2.y*a;n=o;j=l.m_xf.R;var c=this.m_localAnchor2.x-this.m_localCenterB.x,g=this.m_localAnchor2.y-this.m_localCenterB.y;o=j.col1.x*c+j.col2.x*g;g=j.col1.y*c+j.col2.y*g;c=o;j=l.m_sweep.c.x+c-h.m_sweep.c.x-n;o=l.m_sweep.c.y+g-h.m_sweep.c.y-a;this.m_invMassA=h.m_invMass;this.m_invMassB=
l.m_invMass;this.m_invIA=h.m_invI;this.m_invIB=l.m_invI;this.m_axis.SetV(y.MulMV(q.R,this.m_localXAxis1));this.m_a1=(j+n)*this.m_axis.y-(o+a)*this.m_axis.x;this.m_a2=c*this.m_axis.y-g*this.m_axis.x;this.m_motorMass=this.m_invMassA+this.m_invMassB+this.m_invIA*this.m_a1*this.m_a1+this.m_invIB*this.m_a2*this.m_a2;this.m_motorMass=this.m_motorMass>Number.MIN_VALUE?1/this.m_motorMass:0;this.m_perp.SetV(y.MulMV(q.R,this.m_localYAxis1));this.m_s1=(j+n)*this.m_perp.y-(o+a)*this.m_perp.x;this.m_s2=c*this.m_perp.y-
g*this.m_perp.x;q=this.m_invMassA;n=this.m_invMassB;a=this.m_invIA;c=this.m_invIB;this.m_K.col1.x=q+n+a*this.m_s1*this.m_s1+c*this.m_s2*this.m_s2;this.m_K.col1.y=a*this.m_s1*this.m_a1+c*this.m_s2*this.m_a2;this.m_K.col2.x=this.m_K.col1.y;this.m_K.col2.y=q+n+a*this.m_a1*this.m_a1+c*this.m_a2*this.m_a2;if(this.m_enableLimit){j=this.m_axis.x*j+this.m_axis.y*o;if(y.Abs(this.m_upperTranslation-this.m_lowerTranslation)<2*F.b2_linearSlop)this.m_limitState=I.e_equalLimits;else if(j<=this.m_lowerTranslation){if(this.m_limitState!=
I.e_atLowerLimit){this.m_limitState=I.e_atLowerLimit;this.m_impulse.y=0}}else if(j>=this.m_upperTranslation){if(this.m_limitState!=I.e_atUpperLimit){this.m_limitState=I.e_atUpperLimit;this.m_impulse.y=0}}else{this.m_limitState=I.e_inactiveLimit;this.m_impulse.y=0}}else this.m_limitState=I.e_inactiveLimit;if(this.m_enableMotor==false)this.m_motorImpulse=0;if(d.warmStarting){this.m_impulse.x*=d.dtRatio;this.m_impulse.y*=d.dtRatio;this.m_motorImpulse*=d.dtRatio;d=this.m_impulse.x*this.m_perp.x+(this.m_motorImpulse+
this.m_impulse.y)*this.m_axis.x;j=this.m_impulse.x*this.m_perp.y+(this.m_motorImpulse+this.m_impulse.y)*this.m_axis.y;o=this.m_impulse.x*this.m_s1+(this.m_motorImpulse+this.m_impulse.y)*this.m_a1;q=this.m_impulse.x*this.m_s2+(this.m_motorImpulse+this.m_impulse.y)*this.m_a2;h.m_linearVelocity.x-=this.m_invMassA*d;h.m_linearVelocity.y-=this.m_invMassA*j;h.m_angularVelocity-=this.m_invIA*o;l.m_linearVelocity.x+=this.m_invMassB*d;l.m_linearVelocity.y+=this.m_invMassB*j;l.m_angularVelocity+=this.m_invIB*
q}else{this.m_impulse.SetZero();this.m_motorImpulse=0}};k.prototype.SolveVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j=h.m_linearVelocity,o=h.m_angularVelocity,q=l.m_linearVelocity,n=l.m_angularVelocity,a=0,c=0,g=0,b=0;if(this.m_enableMotor&&this.m_limitState!=I.e_equalLimits){b=this.m_motorMass*(this.m_motorSpeed-(this.m_axis.x*(q.x-j.x)+this.m_axis.y*(q.y-j.y)+this.m_a2*n-this.m_a1*o));a=this.m_motorImpulse;c=d.dt*this.m_maxMotorForce;this.m_motorImpulse=y.Clamp(this.m_motorImpulse+
b,-c,c);b=this.m_motorImpulse-a;a=b*this.m_axis.x;c=b*this.m_axis.y;g=b*this.m_a1;b=b*this.m_a2;j.x-=this.m_invMassA*a;j.y-=this.m_invMassA*c;o-=this.m_invIA*g;q.x+=this.m_invMassB*a;q.y+=this.m_invMassB*c;n+=this.m_invIB*b}c=this.m_perp.x*(q.x-j.x)+this.m_perp.y*(q.y-j.y)+this.m_s2*n-this.m_s1*o;if(this.m_enableLimit&&this.m_limitState!=I.e_inactiveLimit){g=this.m_axis.x*(q.x-j.x)+this.m_axis.y*(q.y-j.y)+this.m_a2*n-this.m_a1*o;a=this.m_impulse.Copy();d=this.m_K.Solve(new w,-c,-g);this.m_impulse.Add(d);
if(this.m_limitState==I.e_atLowerLimit)this.m_impulse.y=y.Max(this.m_impulse.y,0);else if(this.m_limitState==I.e_atUpperLimit)this.m_impulse.y=y.Min(this.m_impulse.y,0);c=-c-(this.m_impulse.y-a.y)*this.m_K.col2.x;g=0;g=this.m_K.col1.x!=0?c/this.m_K.col1.x+a.x:a.x;this.m_impulse.x=g;d.x=this.m_impulse.x-a.x;d.y=this.m_impulse.y-a.y;a=d.x*this.m_perp.x+d.y*this.m_axis.x;c=d.x*this.m_perp.y+d.y*this.m_axis.y;g=d.x*this.m_s1+d.y*this.m_a1;b=d.x*this.m_s2+d.y*this.m_a2}else{d=0;d=this.m_K.col1.x!=0?-c/
this.m_K.col1.x:0;this.m_impulse.x+=d;a=d*this.m_perp.x;c=d*this.m_perp.y;g=d*this.m_s1;b=d*this.m_s2}j.x-=this.m_invMassA*a;j.y-=this.m_invMassA*c;o-=this.m_invIA*g;q.x+=this.m_invMassB*a;q.y+=this.m_invMassB*c;n+=this.m_invIB*b;h.m_linearVelocity.SetV(j);h.m_angularVelocity=o;l.m_linearVelocity.SetV(q);l.m_angularVelocity=n};k.prototype.SolvePositionConstraints=function(){var d=this.m_bodyA,h=this.m_bodyB,l=d.m_sweep.c,j=d.m_sweep.a,o=h.m_sweep.c,q=h.m_sweep.a,n,a=0,c=0,g=0,b=0,e=n=0,f=0;c=false;
var m=0,r=G.FromAngle(j);g=G.FromAngle(q);n=r;f=this.m_localAnchor1.x-this.m_localCenterA.x;var s=this.m_localAnchor1.y-this.m_localCenterA.y;a=n.col1.x*f+n.col2.x*s;s=n.col1.y*f+n.col2.y*s;f=a;n=g;g=this.m_localAnchor2.x-this.m_localCenterB.x;b=this.m_localAnchor2.y-this.m_localCenterB.y;a=n.col1.x*g+n.col2.x*b;b=n.col1.y*g+n.col2.y*b;g=a;n=o.x+g-l.x-f;a=o.y+b-l.y-s;if(this.m_enableLimit){this.m_axis=y.MulMV(r,this.m_localXAxis1);this.m_a1=(n+f)*this.m_axis.y-(a+s)*this.m_axis.x;this.m_a2=g*this.m_axis.y-
b*this.m_axis.x;var v=this.m_axis.x*n+this.m_axis.y*a;if(y.Abs(this.m_upperTranslation-this.m_lowerTranslation)<2*F.b2_linearSlop){m=y.Clamp(v,-F.b2_maxLinearCorrection,F.b2_maxLinearCorrection);e=y.Abs(v);c=true}else if(v<=this.m_lowerTranslation){m=y.Clamp(v-this.m_lowerTranslation+F.b2_linearSlop,-F.b2_maxLinearCorrection,0);e=this.m_lowerTranslation-v;c=true}else if(v>=this.m_upperTranslation){m=y.Clamp(v-this.m_upperTranslation+F.b2_linearSlop,0,F.b2_maxLinearCorrection);e=v-this.m_upperTranslation;
c=true}}this.m_perp=y.MulMV(r,this.m_localYAxis1);this.m_s1=(n+f)*this.m_perp.y-(a+s)*this.m_perp.x;this.m_s2=g*this.m_perp.y-b*this.m_perp.x;r=new w;s=this.m_perp.x*n+this.m_perp.y*a;e=y.Max(e,y.Abs(s));f=0;if(c){c=this.m_invMassA;g=this.m_invMassB;b=this.m_invIA;n=this.m_invIB;this.m_K.col1.x=c+g+b*this.m_s1*this.m_s1+n*this.m_s2*this.m_s2;this.m_K.col1.y=b*this.m_s1*this.m_a1+n*this.m_s2*this.m_a2;this.m_K.col2.x=this.m_K.col1.y;this.m_K.col2.y=c+g+b*this.m_a1*this.m_a1+n*this.m_a2*this.m_a2;this.m_K.Solve(r,
-s,-m)}else{c=this.m_invMassA;g=this.m_invMassB;b=this.m_invIA;n=this.m_invIB;m=c+g+b*this.m_s1*this.m_s1+n*this.m_s2*this.m_s2;c=0;c=m!=0?-s/m:0;r.x=c;r.y=0}m=r.x*this.m_perp.x+r.y*this.m_axis.x;c=r.x*this.m_perp.y+r.y*this.m_axis.y;s=r.x*this.m_s1+r.y*this.m_a1;r=r.x*this.m_s2+r.y*this.m_a2;l.x-=this.m_invMassA*m;l.y-=this.m_invMassA*c;j-=this.m_invIA*s;o.x+=this.m_invMassB*m;o.y+=this.m_invMassB*c;q+=this.m_invIB*r;d.m_sweep.a=j;h.m_sweep.a=q;d.SynchronizeTransform();h.SynchronizeTransform();return e<=
F.b2_linearSlop&&f<=F.b2_angularSlop};Box2D.inherit(z,Box2D.Dynamics.Joints.b2JointDef);z.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;z.b2LineJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=new w;this.localAnchorB=new w;this.localAxisA=new w};z.prototype.b2LineJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_lineJoint;this.localAxisA.Set(1,0);this.enableLimit=false;this.upperTranslation=this.lowerTranslation=
0;this.enableMotor=false;this.motorSpeed=this.maxMotorForce=0};z.prototype.Initialize=function(d,h,l,j){this.bodyA=d;this.bodyB=h;this.localAnchorA=this.bodyA.GetLocalPoint(l);this.localAnchorB=this.bodyB.GetLocalPoint(l);this.localAxisA=this.bodyA.GetLocalVector(j)};Box2D.inherit(u,Box2D.Dynamics.Joints.b2Joint);u.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;u.b2MouseJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.K=new G;this.K1=new G;this.K2=new G;
this.m_localAnchor=new w;this.m_target=new w;this.m_impulse=new w;this.m_mass=new G;this.m_C=new w};u.prototype.GetAnchorA=function(){return this.m_target};u.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor)};u.prototype.GetReactionForce=function(d){if(d===undefined)d=0;return new w(d*this.m_impulse.x,d*this.m_impulse.y)};u.prototype.GetReactionTorque=function(){return 0};u.prototype.GetTarget=function(){return this.m_target};u.prototype.SetTarget=function(d){this.m_bodyB.IsAwake()==
false&&this.m_bodyB.SetAwake(true);this.m_target=d};u.prototype.GetMaxForce=function(){return this.m_maxForce};u.prototype.SetMaxForce=function(d){if(d===undefined)d=0;this.m_maxForce=d};u.prototype.GetFrequency=function(){return this.m_frequencyHz};u.prototype.SetFrequency=function(d){if(d===undefined)d=0;this.m_frequencyHz=d};u.prototype.GetDampingRatio=function(){return this.m_dampingRatio};u.prototype.SetDampingRatio=function(d){if(d===undefined)d=0;this.m_dampingRatio=d};u.prototype.b2MouseJoint=
function(d){this.__super.b2Joint.call(this,d);this.m_target.SetV(d.target);var h=this.m_target.x-this.m_bodyB.m_xf.position.x,l=this.m_target.y-this.m_bodyB.m_xf.position.y,j=this.m_bodyB.m_xf.R;this.m_localAnchor.x=h*j.col1.x+l*j.col1.y;this.m_localAnchor.y=h*j.col2.x+l*j.col2.y;this.m_maxForce=d.maxForce;this.m_impulse.SetZero();this.m_frequencyHz=d.frequencyHz;this.m_dampingRatio=d.dampingRatio;this.m_gamma=this.m_beta=0};u.prototype.InitVelocityConstraints=function(d){var h=this.m_bodyB,l=h.GetMass(),
j=2*Math.PI*this.m_frequencyHz,o=l*j*j;this.m_gamma=d.dt*(2*l*this.m_dampingRatio*j+d.dt*o);this.m_gamma=this.m_gamma!=0?1/this.m_gamma:0;this.m_beta=d.dt*o*this.m_gamma;o=h.m_xf.R;l=this.m_localAnchor.x-h.m_sweep.localCenter.x;j=this.m_localAnchor.y-h.m_sweep.localCenter.y;var q=o.col1.x*l+o.col2.x*j;j=o.col1.y*l+o.col2.y*j;l=q;o=h.m_invMass;q=h.m_invI;this.K1.col1.x=o;this.K1.col2.x=0;this.K1.col1.y=0;this.K1.col2.y=o;this.K2.col1.x=q*j*j;this.K2.col2.x=-q*l*j;this.K2.col1.y=-q*l*j;this.K2.col2.y=
q*l*l;this.K.SetM(this.K1);this.K.AddM(this.K2);this.K.col1.x+=this.m_gamma;this.K.col2.y+=this.m_gamma;this.K.GetInverse(this.m_mass);this.m_C.x=h.m_sweep.c.x+l-this.m_target.x;this.m_C.y=h.m_sweep.c.y+j-this.m_target.y;h.m_angularVelocity*=0.98;this.m_impulse.x*=d.dtRatio;this.m_impulse.y*=d.dtRatio;h.m_linearVelocity.x+=o*this.m_impulse.x;h.m_linearVelocity.y+=o*this.m_impulse.y;h.m_angularVelocity+=q*(l*this.m_impulse.y-j*this.m_impulse.x)};u.prototype.SolveVelocityConstraints=function(d){var h=
this.m_bodyB,l,j=0,o=0;l=h.m_xf.R;var q=this.m_localAnchor.x-h.m_sweep.localCenter.x,n=this.m_localAnchor.y-h.m_sweep.localCenter.y;j=l.col1.x*q+l.col2.x*n;n=l.col1.y*q+l.col2.y*n;q=j;j=h.m_linearVelocity.x+-h.m_angularVelocity*n;var a=h.m_linearVelocity.y+h.m_angularVelocity*q;l=this.m_mass;j=j+this.m_beta*this.m_C.x+this.m_gamma*this.m_impulse.x;o=a+this.m_beta*this.m_C.y+this.m_gamma*this.m_impulse.y;a=-(l.col1.x*j+l.col2.x*o);o=-(l.col1.y*j+l.col2.y*o);l=this.m_impulse.x;j=this.m_impulse.y;this.m_impulse.x+=
a;this.m_impulse.y+=o;d=d.dt*this.m_maxForce;this.m_impulse.LengthSquared()>d*d&&this.m_impulse.Multiply(d/this.m_impulse.Length());a=this.m_impulse.x-l;o=this.m_impulse.y-j;h.m_linearVelocity.x+=h.m_invMass*a;h.m_linearVelocity.y+=h.m_invMass*o;h.m_angularVelocity+=h.m_invI*(q*o-n*a)};u.prototype.SolvePositionConstraints=function(){return true};Box2D.inherit(D,Box2D.Dynamics.Joints.b2JointDef);D.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;D.b2MouseJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,
arguments);this.target=new w};D.prototype.b2MouseJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_mouseJoint;this.maxForce=0;this.frequencyHz=5;this.dampingRatio=0.7};Box2D.inherit(H,Box2D.Dynamics.Joints.b2Joint);H.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;H.b2PrismaticJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_localXAxis1=new w;this.m_localYAxis1=new w;this.m_axis=new w;
this.m_perp=new w;this.m_K=new K;this.m_impulse=new A};H.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};H.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};H.prototype.GetReactionForce=function(d){if(d===undefined)d=0;return new w(d*(this.m_impulse.x*this.m_perp.x+(this.m_motorImpulse+this.m_impulse.z)*this.m_axis.x),d*(this.m_impulse.x*this.m_perp.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_axis.y))};H.prototype.GetReactionTorque=
function(d){if(d===undefined)d=0;return d*this.m_impulse.y};H.prototype.GetJointTranslation=function(){var d=this.m_bodyA,h=this.m_bodyB,l=d.GetWorldPoint(this.m_localAnchor1),j=h.GetWorldPoint(this.m_localAnchor2);h=j.x-l.x;l=j.y-l.y;d=d.GetWorldVector(this.m_localXAxis1);return d.x*h+d.y*l};H.prototype.GetJointSpeed=function(){var d=this.m_bodyA,h=this.m_bodyB,l;l=d.m_xf.R;var j=this.m_localAnchor1.x-d.m_sweep.localCenter.x,o=this.m_localAnchor1.y-d.m_sweep.localCenter.y,q=l.col1.x*j+l.col2.x*o;
o=l.col1.y*j+l.col2.y*o;j=q;l=h.m_xf.R;var n=this.m_localAnchor2.x-h.m_sweep.localCenter.x,a=this.m_localAnchor2.y-h.m_sweep.localCenter.y;q=l.col1.x*n+l.col2.x*a;a=l.col1.y*n+l.col2.y*a;n=q;l=h.m_sweep.c.x+n-(d.m_sweep.c.x+j);q=h.m_sweep.c.y+a-(d.m_sweep.c.y+o);var c=d.GetWorldVector(this.m_localXAxis1),g=d.m_linearVelocity,b=h.m_linearVelocity;d=d.m_angularVelocity;h=h.m_angularVelocity;return l*-d*c.y+q*d*c.x+(c.x*(b.x+-h*a-g.x- -d*o)+c.y*(b.y+h*n-g.y-d*j))};H.prototype.IsLimitEnabled=function(){return this.m_enableLimit};
H.prototype.EnableLimit=function(d){this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_enableLimit=d};H.prototype.GetLowerLimit=function(){return this.m_lowerTranslation};H.prototype.GetUpperLimit=function(){return this.m_upperTranslation};H.prototype.SetLimits=function(d,h){if(d===undefined)d=0;if(h===undefined)h=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_lowerTranslation=d;this.m_upperTranslation=h};H.prototype.IsMotorEnabled=function(){return this.m_enableMotor};
H.prototype.EnableMotor=function(d){this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_enableMotor=d};H.prototype.SetMotorSpeed=function(d){if(d===undefined)d=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_motorSpeed=d};H.prototype.GetMotorSpeed=function(){return this.m_motorSpeed};H.prototype.SetMaxMotorForce=function(d){if(d===undefined)d=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_maxMotorForce=d};H.prototype.GetMotorForce=function(){return this.m_motorImpulse};
H.prototype.b2PrismaticJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchor1.SetV(d.localAnchorA);this.m_localAnchor2.SetV(d.localAnchorB);this.m_localXAxis1.SetV(d.localAxisA);this.m_localYAxis1.x=-this.m_localXAxis1.y;this.m_localYAxis1.y=this.m_localXAxis1.x;this.m_refAngle=d.referenceAngle;this.m_impulse.SetZero();this.m_motorImpulse=this.m_motorMass=0;this.m_lowerTranslation=d.lowerTranslation;this.m_upperTranslation=d.upperTranslation;this.m_maxMotorForce=d.maxMotorForce;this.m_motorSpeed=
d.motorSpeed;this.m_enableLimit=d.enableLimit;this.m_enableMotor=d.enableMotor;this.m_limitState=I.e_inactiveLimit;this.m_axis.SetZero();this.m_perp.SetZero()};H.prototype.InitVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j,o=0;this.m_localCenterA.SetV(h.GetLocalCenter());this.m_localCenterB.SetV(l.GetLocalCenter());var q=h.GetTransform();l.GetTransform();j=h.m_xf.R;var n=this.m_localAnchor1.x-this.m_localCenterA.x,a=this.m_localAnchor1.y-this.m_localCenterA.y;o=j.col1.x*n+j.col2.x*
a;a=j.col1.y*n+j.col2.y*a;n=o;j=l.m_xf.R;var c=this.m_localAnchor2.x-this.m_localCenterB.x,g=this.m_localAnchor2.y-this.m_localCenterB.y;o=j.col1.x*c+j.col2.x*g;g=j.col1.y*c+j.col2.y*g;c=o;j=l.m_sweep.c.x+c-h.m_sweep.c.x-n;o=l.m_sweep.c.y+g-h.m_sweep.c.y-a;this.m_invMassA=h.m_invMass;this.m_invMassB=l.m_invMass;this.m_invIA=h.m_invI;this.m_invIB=l.m_invI;this.m_axis.SetV(y.MulMV(q.R,this.m_localXAxis1));this.m_a1=(j+n)*this.m_axis.y-(o+a)*this.m_axis.x;this.m_a2=c*this.m_axis.y-g*this.m_axis.x;this.m_motorMass=
this.m_invMassA+this.m_invMassB+this.m_invIA*this.m_a1*this.m_a1+this.m_invIB*this.m_a2*this.m_a2;if(this.m_motorMass>Number.MIN_VALUE)this.m_motorMass=1/this.m_motorMass;this.m_perp.SetV(y.MulMV(q.R,this.m_localYAxis1));this.m_s1=(j+n)*this.m_perp.y-(o+a)*this.m_perp.x;this.m_s2=c*this.m_perp.y-g*this.m_perp.x;q=this.m_invMassA;n=this.m_invMassB;a=this.m_invIA;c=this.m_invIB;this.m_K.col1.x=q+n+a*this.m_s1*this.m_s1+c*this.m_s2*this.m_s2;this.m_K.col1.y=a*this.m_s1+c*this.m_s2;this.m_K.col1.z=a*
this.m_s1*this.m_a1+c*this.m_s2*this.m_a2;this.m_K.col2.x=this.m_K.col1.y;this.m_K.col2.y=a+c;this.m_K.col2.z=a*this.m_a1+c*this.m_a2;this.m_K.col3.x=this.m_K.col1.z;this.m_K.col3.y=this.m_K.col2.z;this.m_K.col3.z=q+n+a*this.m_a1*this.m_a1+c*this.m_a2*this.m_a2;if(this.m_enableLimit){j=this.m_axis.x*j+this.m_axis.y*o;if(y.Abs(this.m_upperTranslation-this.m_lowerTranslation)<2*F.b2_linearSlop)this.m_limitState=I.e_equalLimits;else if(j<=this.m_lowerTranslation){if(this.m_limitState!=I.e_atLowerLimit){this.m_limitState=
I.e_atLowerLimit;this.m_impulse.z=0}}else if(j>=this.m_upperTranslation){if(this.m_limitState!=I.e_atUpperLimit){this.m_limitState=I.e_atUpperLimit;this.m_impulse.z=0}}else{this.m_limitState=I.e_inactiveLimit;this.m_impulse.z=0}}else this.m_limitState=I.e_inactiveLimit;if(this.m_enableMotor==false)this.m_motorImpulse=0;if(d.warmStarting){this.m_impulse.x*=d.dtRatio;this.m_impulse.y*=d.dtRatio;this.m_motorImpulse*=d.dtRatio;d=this.m_impulse.x*this.m_perp.x+(this.m_motorImpulse+this.m_impulse.z)*this.m_axis.x;
j=this.m_impulse.x*this.m_perp.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_axis.y;o=this.m_impulse.x*this.m_s1+this.m_impulse.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_a1;q=this.m_impulse.x*this.m_s2+this.m_impulse.y+(this.m_motorImpulse+this.m_impulse.z)*this.m_a2;h.m_linearVelocity.x-=this.m_invMassA*d;h.m_linearVelocity.y-=this.m_invMassA*j;h.m_angularVelocity-=this.m_invIA*o;l.m_linearVelocity.x+=this.m_invMassB*d;l.m_linearVelocity.y+=this.m_invMassB*j;l.m_angularVelocity+=this.m_invIB*
q}else{this.m_impulse.SetZero();this.m_motorImpulse=0}};H.prototype.SolveVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j=h.m_linearVelocity,o=h.m_angularVelocity,q=l.m_linearVelocity,n=l.m_angularVelocity,a=0,c=0,g=0,b=0;if(this.m_enableMotor&&this.m_limitState!=I.e_equalLimits){b=this.m_motorMass*(this.m_motorSpeed-(this.m_axis.x*(q.x-j.x)+this.m_axis.y*(q.y-j.y)+this.m_a2*n-this.m_a1*o));a=this.m_motorImpulse;d=d.dt*this.m_maxMotorForce;this.m_motorImpulse=y.Clamp(this.m_motorImpulse+
b,-d,d);b=this.m_motorImpulse-a;a=b*this.m_axis.x;c=b*this.m_axis.y;g=b*this.m_a1;b=b*this.m_a2;j.x-=this.m_invMassA*a;j.y-=this.m_invMassA*c;o-=this.m_invIA*g;q.x+=this.m_invMassB*a;q.y+=this.m_invMassB*c;n+=this.m_invIB*b}g=this.m_perp.x*(q.x-j.x)+this.m_perp.y*(q.y-j.y)+this.m_s2*n-this.m_s1*o;c=n-o;if(this.m_enableLimit&&this.m_limitState!=I.e_inactiveLimit){d=this.m_axis.x*(q.x-j.x)+this.m_axis.y*(q.y-j.y)+this.m_a2*n-this.m_a1*o;a=this.m_impulse.Copy();d=this.m_K.Solve33(new A,-g,-c,-d);this.m_impulse.Add(d);
if(this.m_limitState==I.e_atLowerLimit)this.m_impulse.z=y.Max(this.m_impulse.z,0);else if(this.m_limitState==I.e_atUpperLimit)this.m_impulse.z=y.Min(this.m_impulse.z,0);g=-g-(this.m_impulse.z-a.z)*this.m_K.col3.x;c=-c-(this.m_impulse.z-a.z)*this.m_K.col3.y;c=this.m_K.Solve22(new w,g,c);c.x+=a.x;c.y+=a.y;this.m_impulse.x=c.x;this.m_impulse.y=c.y;d.x=this.m_impulse.x-a.x;d.y=this.m_impulse.y-a.y;d.z=this.m_impulse.z-a.z;a=d.x*this.m_perp.x+d.z*this.m_axis.x;c=d.x*this.m_perp.y+d.z*this.m_axis.y;g=d.x*
this.m_s1+d.y+d.z*this.m_a1;b=d.x*this.m_s2+d.y+d.z*this.m_a2}else{d=this.m_K.Solve22(new w,-g,-c);this.m_impulse.x+=d.x;this.m_impulse.y+=d.y;a=d.x*this.m_perp.x;c=d.x*this.m_perp.y;g=d.x*this.m_s1+d.y;b=d.x*this.m_s2+d.y}j.x-=this.m_invMassA*a;j.y-=this.m_invMassA*c;o-=this.m_invIA*g;q.x+=this.m_invMassB*a;q.y+=this.m_invMassB*c;n+=this.m_invIB*b;h.m_linearVelocity.SetV(j);h.m_angularVelocity=o;l.m_linearVelocity.SetV(q);l.m_angularVelocity=n};H.prototype.SolvePositionConstraints=function(){var d=
this.m_bodyA,h=this.m_bodyB,l=d.m_sweep.c,j=d.m_sweep.a,o=h.m_sweep.c,q=h.m_sweep.a,n,a=0,c=0,g=0,b=a=n=0,e=0;c=false;var f=0,m=G.FromAngle(j),r=G.FromAngle(q);n=m;e=this.m_localAnchor1.x-this.m_localCenterA.x;var s=this.m_localAnchor1.y-this.m_localCenterA.y;a=n.col1.x*e+n.col2.x*s;s=n.col1.y*e+n.col2.y*s;e=a;n=r;r=this.m_localAnchor2.x-this.m_localCenterB.x;g=this.m_localAnchor2.y-this.m_localCenterB.y;a=n.col1.x*r+n.col2.x*g;g=n.col1.y*r+n.col2.y*g;r=a;n=o.x+r-l.x-e;a=o.y+g-l.y-s;if(this.m_enableLimit){this.m_axis=
y.MulMV(m,this.m_localXAxis1);this.m_a1=(n+e)*this.m_axis.y-(a+s)*this.m_axis.x;this.m_a2=r*this.m_axis.y-g*this.m_axis.x;var v=this.m_axis.x*n+this.m_axis.y*a;if(y.Abs(this.m_upperTranslation-this.m_lowerTranslation)<2*F.b2_linearSlop){f=y.Clamp(v,-F.b2_maxLinearCorrection,F.b2_maxLinearCorrection);b=y.Abs(v);c=true}else if(v<=this.m_lowerTranslation){f=y.Clamp(v-this.m_lowerTranslation+F.b2_linearSlop,-F.b2_maxLinearCorrection,0);b=this.m_lowerTranslation-v;c=true}else if(v>=this.m_upperTranslation){f=
y.Clamp(v-this.m_upperTranslation+F.b2_linearSlop,0,F.b2_maxLinearCorrection);b=v-this.m_upperTranslation;c=true}}this.m_perp=y.MulMV(m,this.m_localYAxis1);this.m_s1=(n+e)*this.m_perp.y-(a+s)*this.m_perp.x;this.m_s2=r*this.m_perp.y-g*this.m_perp.x;m=new A;s=this.m_perp.x*n+this.m_perp.y*a;r=q-j-this.m_refAngle;b=y.Max(b,y.Abs(s));e=y.Abs(r);if(c){c=this.m_invMassA;g=this.m_invMassB;n=this.m_invIA;a=this.m_invIB;this.m_K.col1.x=c+g+n*this.m_s1*this.m_s1+a*this.m_s2*this.m_s2;this.m_K.col1.y=n*this.m_s1+
a*this.m_s2;this.m_K.col1.z=n*this.m_s1*this.m_a1+a*this.m_s2*this.m_a2;this.m_K.col2.x=this.m_K.col1.y;this.m_K.col2.y=n+a;this.m_K.col2.z=n*this.m_a1+a*this.m_a2;this.m_K.col3.x=this.m_K.col1.z;this.m_K.col3.y=this.m_K.col2.z;this.m_K.col3.z=c+g+n*this.m_a1*this.m_a1+a*this.m_a2*this.m_a2;this.m_K.Solve33(m,-s,-r,-f)}else{c=this.m_invMassA;g=this.m_invMassB;n=this.m_invIA;a=this.m_invIB;f=n*this.m_s1+a*this.m_s2;v=n+a;this.m_K.col1.Set(c+g+n*this.m_s1*this.m_s1+a*this.m_s2*this.m_s2,f,0);this.m_K.col2.Set(f,
v,0);f=this.m_K.Solve22(new w,-s,-r);m.x=f.x;m.y=f.y;m.z=0}f=m.x*this.m_perp.x+m.z*this.m_axis.x;c=m.x*this.m_perp.y+m.z*this.m_axis.y;s=m.x*this.m_s1+m.y+m.z*this.m_a1;m=m.x*this.m_s2+m.y+m.z*this.m_a2;l.x-=this.m_invMassA*f;l.y-=this.m_invMassA*c;j-=this.m_invIA*s;o.x+=this.m_invMassB*f;o.y+=this.m_invMassB*c;q+=this.m_invIB*m;d.m_sweep.a=j;h.m_sweep.a=q;d.SynchronizeTransform();h.SynchronizeTransform();return b<=F.b2_linearSlop&&e<=F.b2_angularSlop};Box2D.inherit(O,Box2D.Dynamics.Joints.b2JointDef);
O.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;O.b2PrismaticJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=new w;this.localAnchorB=new w;this.localAxisA=new w};O.prototype.b2PrismaticJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_prismaticJoint;this.localAxisA.Set(1,0);this.referenceAngle=0;this.enableLimit=false;this.upperTranslation=this.lowerTranslation=0;this.enableMotor=false;this.motorSpeed=this.maxMotorForce=
0};O.prototype.Initialize=function(d,h,l,j){this.bodyA=d;this.bodyB=h;this.localAnchorA=this.bodyA.GetLocalPoint(l);this.localAnchorB=this.bodyB.GetLocalPoint(l);this.localAxisA=this.bodyA.GetLocalVector(j);this.referenceAngle=this.bodyB.GetAngle()-this.bodyA.GetAngle()};Box2D.inherit(E,Box2D.Dynamics.Joints.b2Joint);E.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;E.b2PulleyJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_groundAnchor1=new w;this.m_groundAnchor2=
new w;this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_u1=new w;this.m_u2=new w};E.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};E.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};E.prototype.GetReactionForce=function(d){if(d===undefined)d=0;return new w(d*this.m_impulse*this.m_u2.x,d*this.m_impulse*this.m_u2.y)};E.prototype.GetReactionTorque=function(){return 0};E.prototype.GetGroundAnchorA=function(){var d=
this.m_ground.m_xf.position.Copy();d.Add(this.m_groundAnchor1);return d};E.prototype.GetGroundAnchorB=function(){var d=this.m_ground.m_xf.position.Copy();d.Add(this.m_groundAnchor2);return d};E.prototype.GetLength1=function(){var d=this.m_bodyA.GetWorldPoint(this.m_localAnchor1),h=d.x-(this.m_ground.m_xf.position.x+this.m_groundAnchor1.x);d=d.y-(this.m_ground.m_xf.position.y+this.m_groundAnchor1.y);return Math.sqrt(h*h+d*d)};E.prototype.GetLength2=function(){var d=this.m_bodyB.GetWorldPoint(this.m_localAnchor2),
h=d.x-(this.m_ground.m_xf.position.x+this.m_groundAnchor2.x);d=d.y-(this.m_ground.m_xf.position.y+this.m_groundAnchor2.y);return Math.sqrt(h*h+d*d)};E.prototype.GetRatio=function(){return this.m_ratio};E.prototype.b2PulleyJoint=function(d){this.__super.b2Joint.call(this,d);this.m_ground=this.m_bodyA.m_world.m_groundBody;this.m_groundAnchor1.x=d.groundAnchorA.x-this.m_ground.m_xf.position.x;this.m_groundAnchor1.y=d.groundAnchorA.y-this.m_ground.m_xf.position.y;this.m_groundAnchor2.x=d.groundAnchorB.x-
this.m_ground.m_xf.position.x;this.m_groundAnchor2.y=d.groundAnchorB.y-this.m_ground.m_xf.position.y;this.m_localAnchor1.SetV(d.localAnchorA);this.m_localAnchor2.SetV(d.localAnchorB);this.m_ratio=d.ratio;this.m_constant=d.lengthA+this.m_ratio*d.lengthB;this.m_maxLength1=y.Min(d.maxLengthA,this.m_constant-this.m_ratio*E.b2_minPulleyLength);this.m_maxLength2=y.Min(d.maxLengthB,(this.m_constant-E.b2_minPulleyLength)/this.m_ratio);this.m_limitImpulse2=this.m_limitImpulse1=this.m_impulse=0};E.prototype.InitVelocityConstraints=
function(d){var h=this.m_bodyA,l=this.m_bodyB,j;j=h.m_xf.R;var o=this.m_localAnchor1.x-h.m_sweep.localCenter.x,q=this.m_localAnchor1.y-h.m_sweep.localCenter.y,n=j.col1.x*o+j.col2.x*q;q=j.col1.y*o+j.col2.y*q;o=n;j=l.m_xf.R;var a=this.m_localAnchor2.x-l.m_sweep.localCenter.x,c=this.m_localAnchor2.y-l.m_sweep.localCenter.y;n=j.col1.x*a+j.col2.x*c;c=j.col1.y*a+j.col2.y*c;a=n;j=l.m_sweep.c.x+a;n=l.m_sweep.c.y+c;var g=this.m_ground.m_xf.position.x+this.m_groundAnchor2.x,b=this.m_ground.m_xf.position.y+
this.m_groundAnchor2.y;this.m_u1.Set(h.m_sweep.c.x+o-(this.m_ground.m_xf.position.x+this.m_groundAnchor1.x),h.m_sweep.c.y+q-(this.m_ground.m_xf.position.y+this.m_groundAnchor1.y));this.m_u2.Set(j-g,n-b);j=this.m_u1.Length();n=this.m_u2.Length();j>F.b2_linearSlop?this.m_u1.Multiply(1/j):this.m_u1.SetZero();n>F.b2_linearSlop?this.m_u2.Multiply(1/n):this.m_u2.SetZero();if(this.m_constant-j-this.m_ratio*n>0){this.m_state=I.e_inactiveLimit;this.m_impulse=0}else this.m_state=I.e_atUpperLimit;if(j<this.m_maxLength1){this.m_limitState1=
I.e_inactiveLimit;this.m_limitImpulse1=0}else this.m_limitState1=I.e_atUpperLimit;if(n<this.m_maxLength2){this.m_limitState2=I.e_inactiveLimit;this.m_limitImpulse2=0}else this.m_limitState2=I.e_atUpperLimit;j=o*this.m_u1.y-q*this.m_u1.x;n=a*this.m_u2.y-c*this.m_u2.x;this.m_limitMass1=h.m_invMass+h.m_invI*j*j;this.m_limitMass2=l.m_invMass+l.m_invI*n*n;this.m_pulleyMass=this.m_limitMass1+this.m_ratio*this.m_ratio*this.m_limitMass2;this.m_limitMass1=1/this.m_limitMass1;this.m_limitMass2=1/this.m_limitMass2;
this.m_pulleyMass=1/this.m_pulleyMass;if(d.warmStarting){this.m_impulse*=d.dtRatio;this.m_limitImpulse1*=d.dtRatio;this.m_limitImpulse2*=d.dtRatio;d=(-this.m_impulse-this.m_limitImpulse1)*this.m_u1.x;j=(-this.m_impulse-this.m_limitImpulse1)*this.m_u1.y;n=(-this.m_ratio*this.m_impulse-this.m_limitImpulse2)*this.m_u2.x;g=(-this.m_ratio*this.m_impulse-this.m_limitImpulse2)*this.m_u2.y;h.m_linearVelocity.x+=h.m_invMass*d;h.m_linearVelocity.y+=h.m_invMass*j;h.m_angularVelocity+=h.m_invI*(o*j-q*d);l.m_linearVelocity.x+=
l.m_invMass*n;l.m_linearVelocity.y+=l.m_invMass*g;l.m_angularVelocity+=l.m_invI*(a*g-c*n)}else this.m_limitImpulse2=this.m_limitImpulse1=this.m_impulse=0};E.prototype.SolveVelocityConstraints=function(){var d=this.m_bodyA,h=this.m_bodyB,l;l=d.m_xf.R;var j=this.m_localAnchor1.x-d.m_sweep.localCenter.x,o=this.m_localAnchor1.y-d.m_sweep.localCenter.y,q=l.col1.x*j+l.col2.x*o;o=l.col1.y*j+l.col2.y*o;j=q;l=h.m_xf.R;var n=this.m_localAnchor2.x-h.m_sweep.localCenter.x,a=this.m_localAnchor2.y-h.m_sweep.localCenter.y;
q=l.col1.x*n+l.col2.x*a;a=l.col1.y*n+l.col2.y*a;n=q;var c=q=l=0,g=0;l=g=l=g=c=q=l=0;if(this.m_state==I.e_atUpperLimit){l=d.m_linearVelocity.x+-d.m_angularVelocity*o;q=d.m_linearVelocity.y+d.m_angularVelocity*j;c=h.m_linearVelocity.x+-h.m_angularVelocity*a;g=h.m_linearVelocity.y+h.m_angularVelocity*n;l=-(this.m_u1.x*l+this.m_u1.y*q)-this.m_ratio*(this.m_u2.x*c+this.m_u2.y*g);g=this.m_pulleyMass*-l;l=this.m_impulse;this.m_impulse=y.Max(0,this.m_impulse+g);g=this.m_impulse-l;l=-g*this.m_u1.x;q=-g*this.m_u1.y;
c=-this.m_ratio*g*this.m_u2.x;g=-this.m_ratio*g*this.m_u2.y;d.m_linearVelocity.x+=d.m_invMass*l;d.m_linearVelocity.y+=d.m_invMass*q;d.m_angularVelocity+=d.m_invI*(j*q-o*l);h.m_linearVelocity.x+=h.m_invMass*c;h.m_linearVelocity.y+=h.m_invMass*g;h.m_angularVelocity+=h.m_invI*(n*g-a*c)}if(this.m_limitState1==I.e_atUpperLimit){l=d.m_linearVelocity.x+-d.m_angularVelocity*o;q=d.m_linearVelocity.y+d.m_angularVelocity*j;l=-(this.m_u1.x*l+this.m_u1.y*q);g=-this.m_limitMass1*l;l=this.m_limitImpulse1;this.m_limitImpulse1=
y.Max(0,this.m_limitImpulse1+g);g=this.m_limitImpulse1-l;l=-g*this.m_u1.x;q=-g*this.m_u1.y;d.m_linearVelocity.x+=d.m_invMass*l;d.m_linearVelocity.y+=d.m_invMass*q;d.m_angularVelocity+=d.m_invI*(j*q-o*l)}if(this.m_limitState2==I.e_atUpperLimit){c=h.m_linearVelocity.x+-h.m_angularVelocity*a;g=h.m_linearVelocity.y+h.m_angularVelocity*n;l=-(this.m_u2.x*c+this.m_u2.y*g);g=-this.m_limitMass2*l;l=this.m_limitImpulse2;this.m_limitImpulse2=y.Max(0,this.m_limitImpulse2+g);g=this.m_limitImpulse2-l;c=-g*this.m_u2.x;
g=-g*this.m_u2.y;h.m_linearVelocity.x+=h.m_invMass*c;h.m_linearVelocity.y+=h.m_invMass*g;h.m_angularVelocity+=h.m_invI*(n*g-a*c)}};E.prototype.SolvePositionConstraints=function(){var d=this.m_bodyA,h=this.m_bodyB,l,j=this.m_ground.m_xf.position.x+this.m_groundAnchor1.x,o=this.m_ground.m_xf.position.y+this.m_groundAnchor1.y,q=this.m_ground.m_xf.position.x+this.m_groundAnchor2.x,n=this.m_ground.m_xf.position.y+this.m_groundAnchor2.y,a=0,c=0,g=0,b=0,e=l=0,f=0,m=0,r=e=m=l=e=l=0;if(this.m_state==I.e_atUpperLimit){l=
d.m_xf.R;a=this.m_localAnchor1.x-d.m_sweep.localCenter.x;c=this.m_localAnchor1.y-d.m_sweep.localCenter.y;e=l.col1.x*a+l.col2.x*c;c=l.col1.y*a+l.col2.y*c;a=e;l=h.m_xf.R;g=this.m_localAnchor2.x-h.m_sweep.localCenter.x;b=this.m_localAnchor2.y-h.m_sweep.localCenter.y;e=l.col1.x*g+l.col2.x*b;b=l.col1.y*g+l.col2.y*b;g=e;l=d.m_sweep.c.x+a;e=d.m_sweep.c.y+c;f=h.m_sweep.c.x+g;m=h.m_sweep.c.y+b;this.m_u1.Set(l-j,e-o);this.m_u2.Set(f-q,m-n);l=this.m_u1.Length();e=this.m_u2.Length();l>F.b2_linearSlop?this.m_u1.Multiply(1/
l):this.m_u1.SetZero();e>F.b2_linearSlop?this.m_u2.Multiply(1/e):this.m_u2.SetZero();l=this.m_constant-l-this.m_ratio*e;r=y.Max(r,-l);l=y.Clamp(l+F.b2_linearSlop,-F.b2_maxLinearCorrection,0);m=-this.m_pulleyMass*l;l=-m*this.m_u1.x;e=-m*this.m_u1.y;f=-this.m_ratio*m*this.m_u2.x;m=-this.m_ratio*m*this.m_u2.y;d.m_sweep.c.x+=d.m_invMass*l;d.m_sweep.c.y+=d.m_invMass*e;d.m_sweep.a+=d.m_invI*(a*e-c*l);h.m_sweep.c.x+=h.m_invMass*f;h.m_sweep.c.y+=h.m_invMass*m;h.m_sweep.a+=h.m_invI*(g*m-b*f);d.SynchronizeTransform();
h.SynchronizeTransform()}if(this.m_limitState1==I.e_atUpperLimit){l=d.m_xf.R;a=this.m_localAnchor1.x-d.m_sweep.localCenter.x;c=this.m_localAnchor1.y-d.m_sweep.localCenter.y;e=l.col1.x*a+l.col2.x*c;c=l.col1.y*a+l.col2.y*c;a=e;l=d.m_sweep.c.x+a;e=d.m_sweep.c.y+c;this.m_u1.Set(l-j,e-o);l=this.m_u1.Length();if(l>F.b2_linearSlop){this.m_u1.x*=1/l;this.m_u1.y*=1/l}else this.m_u1.SetZero();l=this.m_maxLength1-l;r=y.Max(r,-l);l=y.Clamp(l+F.b2_linearSlop,-F.b2_maxLinearCorrection,0);m=-this.m_limitMass1*l;
l=-m*this.m_u1.x;e=-m*this.m_u1.y;d.m_sweep.c.x+=d.m_invMass*l;d.m_sweep.c.y+=d.m_invMass*e;d.m_sweep.a+=d.m_invI*(a*e-c*l);d.SynchronizeTransform()}if(this.m_limitState2==I.e_atUpperLimit){l=h.m_xf.R;g=this.m_localAnchor2.x-h.m_sweep.localCenter.x;b=this.m_localAnchor2.y-h.m_sweep.localCenter.y;e=l.col1.x*g+l.col2.x*b;b=l.col1.y*g+l.col2.y*b;g=e;f=h.m_sweep.c.x+g;m=h.m_sweep.c.y+b;this.m_u2.Set(f-q,m-n);e=this.m_u2.Length();if(e>F.b2_linearSlop){this.m_u2.x*=1/e;this.m_u2.y*=1/e}else this.m_u2.SetZero();
l=this.m_maxLength2-e;r=y.Max(r,-l);l=y.Clamp(l+F.b2_linearSlop,-F.b2_maxLinearCorrection,0);m=-this.m_limitMass2*l;f=-m*this.m_u2.x;m=-m*this.m_u2.y;h.m_sweep.c.x+=h.m_invMass*f;h.m_sweep.c.y+=h.m_invMass*m;h.m_sweep.a+=h.m_invI*(g*m-b*f);h.SynchronizeTransform()}return r<F.b2_linearSlop};Box2D.postDefs.push(function(){Box2D.Dynamics.Joints.b2PulleyJoint.b2_minPulleyLength=2});Box2D.inherit(R,Box2D.Dynamics.Joints.b2JointDef);R.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;R.b2PulleyJointDef=
function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.groundAnchorA=new w;this.groundAnchorB=new w;this.localAnchorA=new w;this.localAnchorB=new w};R.prototype.b2PulleyJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_pulleyJoint;this.groundAnchorA.Set(-1,1);this.groundAnchorB.Set(1,1);this.localAnchorA.Set(-1,0);this.localAnchorB.Set(1,0);this.maxLengthB=this.lengthB=this.maxLengthA=this.lengthA=0;this.ratio=1;this.collideConnected=true};R.prototype.Initialize=
function(d,h,l,j,o,q,n){if(n===undefined)n=0;this.bodyA=d;this.bodyB=h;this.groundAnchorA.SetV(l);this.groundAnchorB.SetV(j);this.localAnchorA=this.bodyA.GetLocalPoint(o);this.localAnchorB=this.bodyB.GetLocalPoint(q);d=o.x-l.x;l=o.y-l.y;this.lengthA=Math.sqrt(d*d+l*l);l=q.x-j.x;j=q.y-j.y;this.lengthB=Math.sqrt(l*l+j*j);this.ratio=n;n=this.lengthA+this.ratio*this.lengthB;this.maxLengthA=n-this.ratio*E.b2_minPulleyLength;this.maxLengthB=(n-E.b2_minPulleyLength)/this.ratio};Box2D.inherit(N,Box2D.Dynamics.Joints.b2Joint);
N.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;N.b2RevoluteJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.K=new G;this.K1=new G;this.K2=new G;this.K3=new G;this.impulse3=new A;this.impulse2=new w;this.reduced=new w;this.m_localAnchor1=new w;this.m_localAnchor2=new w;this.m_impulse=new A;this.m_mass=new K};N.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchor1)};N.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchor2)};
N.prototype.GetReactionForce=function(d){if(d===undefined)d=0;return new w(d*this.m_impulse.x,d*this.m_impulse.y)};N.prototype.GetReactionTorque=function(d){if(d===undefined)d=0;return d*this.m_impulse.z};N.prototype.GetJointAngle=function(){return this.m_bodyB.m_sweep.a-this.m_bodyA.m_sweep.a-this.m_referenceAngle};N.prototype.GetJointSpeed=function(){return this.m_bodyB.m_angularVelocity-this.m_bodyA.m_angularVelocity};N.prototype.IsLimitEnabled=function(){return this.m_enableLimit};N.prototype.EnableLimit=
function(d){this.m_enableLimit=d};N.prototype.GetLowerLimit=function(){return this.m_lowerAngle};N.prototype.GetUpperLimit=function(){return this.m_upperAngle};N.prototype.SetLimits=function(d,h){if(d===undefined)d=0;if(h===undefined)h=0;this.m_lowerAngle=d;this.m_upperAngle=h};N.prototype.IsMotorEnabled=function(){this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);return this.m_enableMotor};N.prototype.EnableMotor=function(d){this.m_enableMotor=d};N.prototype.SetMotorSpeed=function(d){if(d===
undefined)d=0;this.m_bodyA.SetAwake(true);this.m_bodyB.SetAwake(true);this.m_motorSpeed=d};N.prototype.GetMotorSpeed=function(){return this.m_motorSpeed};N.prototype.SetMaxMotorTorque=function(d){if(d===undefined)d=0;this.m_maxMotorTorque=d};N.prototype.GetMotorTorque=function(){return this.m_maxMotorTorque};N.prototype.b2RevoluteJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchor1.SetV(d.localAnchorA);this.m_localAnchor2.SetV(d.localAnchorB);this.m_referenceAngle=d.referenceAngle;
this.m_impulse.SetZero();this.m_motorImpulse=0;this.m_lowerAngle=d.lowerAngle;this.m_upperAngle=d.upperAngle;this.m_maxMotorTorque=d.maxMotorTorque;this.m_motorSpeed=d.motorSpeed;this.m_enableLimit=d.enableLimit;this.m_enableMotor=d.enableMotor;this.m_limitState=I.e_inactiveLimit};N.prototype.InitVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j,o=0;j=h.m_xf.R;var q=this.m_localAnchor1.x-h.m_sweep.localCenter.x,n=this.m_localAnchor1.y-h.m_sweep.localCenter.y;o=j.col1.x*q+j.col2.x*
n;n=j.col1.y*q+j.col2.y*n;q=o;j=l.m_xf.R;var a=this.m_localAnchor2.x-l.m_sweep.localCenter.x,c=this.m_localAnchor2.y-l.m_sweep.localCenter.y;o=j.col1.x*a+j.col2.x*c;c=j.col1.y*a+j.col2.y*c;a=o;j=h.m_invMass;o=l.m_invMass;var g=h.m_invI,b=l.m_invI;this.m_mass.col1.x=j+o+n*n*g+c*c*b;this.m_mass.col2.x=-n*q*g-c*a*b;this.m_mass.col3.x=-n*g-c*b;this.m_mass.col1.y=this.m_mass.col2.x;this.m_mass.col2.y=j+o+q*q*g+a*a*b;this.m_mass.col3.y=q*g+a*b;this.m_mass.col1.z=this.m_mass.col3.x;this.m_mass.col2.z=this.m_mass.col3.y;
this.m_mass.col3.z=g+b;this.m_motorMass=1/(g+b);if(this.m_enableMotor==false)this.m_motorImpulse=0;if(this.m_enableLimit){var e=l.m_sweep.a-h.m_sweep.a-this.m_referenceAngle;if(y.Abs(this.m_upperAngle-this.m_lowerAngle)<2*F.b2_angularSlop)this.m_limitState=I.e_equalLimits;else if(e<=this.m_lowerAngle){if(this.m_limitState!=I.e_atLowerLimit)this.m_impulse.z=0;this.m_limitState=I.e_atLowerLimit}else if(e>=this.m_upperAngle){if(this.m_limitState!=I.e_atUpperLimit)this.m_impulse.z=0;this.m_limitState=
I.e_atUpperLimit}else{this.m_limitState=I.e_inactiveLimit;this.m_impulse.z=0}}else this.m_limitState=I.e_inactiveLimit;if(d.warmStarting){this.m_impulse.x*=d.dtRatio;this.m_impulse.y*=d.dtRatio;this.m_motorImpulse*=d.dtRatio;d=this.m_impulse.x;e=this.m_impulse.y;h.m_linearVelocity.x-=j*d;h.m_linearVelocity.y-=j*e;h.m_angularVelocity-=g*(q*e-n*d+this.m_motorImpulse+this.m_impulse.z);l.m_linearVelocity.x+=o*d;l.m_linearVelocity.y+=o*e;l.m_angularVelocity+=b*(a*e-c*d+this.m_motorImpulse+this.m_impulse.z)}else{this.m_impulse.SetZero();
this.m_motorImpulse=0}};N.prototype.SolveVelocityConstraints=function(d){var h=this.m_bodyA,l=this.m_bodyB,j=0,o=j=0,q=0,n=0,a=0,c=h.m_linearVelocity,g=h.m_angularVelocity,b=l.m_linearVelocity,e=l.m_angularVelocity,f=h.m_invMass,m=l.m_invMass,r=h.m_invI,s=l.m_invI;if(this.m_enableMotor&&this.m_limitState!=I.e_equalLimits){o=this.m_motorMass*-(e-g-this.m_motorSpeed);q=this.m_motorImpulse;n=d.dt*this.m_maxMotorTorque;this.m_motorImpulse=y.Clamp(this.m_motorImpulse+o,-n,n);o=this.m_motorImpulse-q;g-=
r*o;e+=s*o}if(this.m_enableLimit&&this.m_limitState!=I.e_inactiveLimit){d=h.m_xf.R;o=this.m_localAnchor1.x-h.m_sweep.localCenter.x;q=this.m_localAnchor1.y-h.m_sweep.localCenter.y;j=d.col1.x*o+d.col2.x*q;q=d.col1.y*o+d.col2.y*q;o=j;d=l.m_xf.R;n=this.m_localAnchor2.x-l.m_sweep.localCenter.x;a=this.m_localAnchor2.y-l.m_sweep.localCenter.y;j=d.col1.x*n+d.col2.x*a;a=d.col1.y*n+d.col2.y*a;n=j;d=b.x+-e*a-c.x- -g*q;var v=b.y+e*n-c.y-g*o;this.m_mass.Solve33(this.impulse3,-d,-v,-(e-g));if(this.m_limitState==
I.e_equalLimits)this.m_impulse.Add(this.impulse3);else if(this.m_limitState==I.e_atLowerLimit){j=this.m_impulse.z+this.impulse3.z;if(j<0){this.m_mass.Solve22(this.reduced,-d,-v);this.impulse3.x=this.reduced.x;this.impulse3.y=this.reduced.y;this.impulse3.z=-this.m_impulse.z;this.m_impulse.x+=this.reduced.x;this.m_impulse.y+=this.reduced.y;this.m_impulse.z=0}}else if(this.m_limitState==I.e_atUpperLimit){j=this.m_impulse.z+this.impulse3.z;if(j>0){this.m_mass.Solve22(this.reduced,-d,-v);this.impulse3.x=
this.reduced.x;this.impulse3.y=this.reduced.y;this.impulse3.z=-this.m_impulse.z;this.m_impulse.x+=this.reduced.x;this.m_impulse.y+=this.reduced.y;this.m_impulse.z=0}}c.x-=f*this.impulse3.x;c.y-=f*this.impulse3.y;g-=r*(o*this.impulse3.y-q*this.impulse3.x+this.impulse3.z);b.x+=m*this.impulse3.x;b.y+=m*this.impulse3.y;e+=s*(n*this.impulse3.y-a*this.impulse3.x+this.impulse3.z)}else{d=h.m_xf.R;o=this.m_localAnchor1.x-h.m_sweep.localCenter.x;q=this.m_localAnchor1.y-h.m_sweep.localCenter.y;j=d.col1.x*o+
d.col2.x*q;q=d.col1.y*o+d.col2.y*q;o=j;d=l.m_xf.R;n=this.m_localAnchor2.x-l.m_sweep.localCenter.x;a=this.m_localAnchor2.y-l.m_sweep.localCenter.y;j=d.col1.x*n+d.col2.x*a;a=d.col1.y*n+d.col2.y*a;n=j;this.m_mass.Solve22(this.impulse2,-(b.x+-e*a-c.x- -g*q),-(b.y+e*n-c.y-g*o));this.m_impulse.x+=this.impulse2.x;this.m_impulse.y+=this.impulse2.y;c.x-=f*this.impulse2.x;c.y-=f*this.impulse2.y;g-=r*(o*this.impulse2.y-q*this.impulse2.x);b.x+=m*this.impulse2.x;b.y+=m*this.impulse2.y;e+=s*(n*this.impulse2.y-
a*this.impulse2.x)}h.m_linearVelocity.SetV(c);h.m_angularVelocity=g;l.m_linearVelocity.SetV(b);l.m_angularVelocity=e};N.prototype.SolvePositionConstraints=function(){var d=0,h,l=this.m_bodyA,j=this.m_bodyB,o=0,q=h=0,n=0,a=0;if(this.m_enableLimit&&this.m_limitState!=I.e_inactiveLimit){d=j.m_sweep.a-l.m_sweep.a-this.m_referenceAngle;var c=0;if(this.m_limitState==I.e_equalLimits){d=y.Clamp(d-this.m_lowerAngle,-F.b2_maxAngularCorrection,F.b2_maxAngularCorrection);c=-this.m_motorMass*d;o=y.Abs(d)}else if(this.m_limitState==
I.e_atLowerLimit){d=d-this.m_lowerAngle;o=-d;d=y.Clamp(d+F.b2_angularSlop,-F.b2_maxAngularCorrection,0);c=-this.m_motorMass*d}else if(this.m_limitState==I.e_atUpperLimit){o=d=d-this.m_upperAngle;d=y.Clamp(d-F.b2_angularSlop,0,F.b2_maxAngularCorrection);c=-this.m_motorMass*d}l.m_sweep.a-=l.m_invI*c;j.m_sweep.a+=j.m_invI*c;l.SynchronizeTransform();j.SynchronizeTransform()}h=l.m_xf.R;c=this.m_localAnchor1.x-l.m_sweep.localCenter.x;d=this.m_localAnchor1.y-l.m_sweep.localCenter.y;q=h.col1.x*c+h.col2.x*
d;d=h.col1.y*c+h.col2.y*d;c=q;h=j.m_xf.R;var g=this.m_localAnchor2.x-j.m_sweep.localCenter.x,b=this.m_localAnchor2.y-j.m_sweep.localCenter.y;q=h.col1.x*g+h.col2.x*b;b=h.col1.y*g+h.col2.y*b;g=q;n=j.m_sweep.c.x+g-l.m_sweep.c.x-c;a=j.m_sweep.c.y+b-l.m_sweep.c.y-d;var e=n*n+a*a;h=Math.sqrt(e);q=l.m_invMass;var f=j.m_invMass,m=l.m_invI,r=j.m_invI,s=10*F.b2_linearSlop;if(e>s*s){e=1/(q+f);n=e*-n;a=e*-a;l.m_sweep.c.x-=0.5*q*n;l.m_sweep.c.y-=0.5*q*a;j.m_sweep.c.x+=0.5*f*n;j.m_sweep.c.y+=0.5*f*a;n=j.m_sweep.c.x+
g-l.m_sweep.c.x-c;a=j.m_sweep.c.y+b-l.m_sweep.c.y-d}this.K1.col1.x=q+f;this.K1.col2.x=0;this.K1.col1.y=0;this.K1.col2.y=q+f;this.K2.col1.x=m*d*d;this.K2.col2.x=-m*c*d;this.K2.col1.y=-m*c*d;this.K2.col2.y=m*c*c;this.K3.col1.x=r*b*b;this.K3.col2.x=-r*g*b;this.K3.col1.y=-r*g*b;this.K3.col2.y=r*g*g;this.K.SetM(this.K1);this.K.AddM(this.K2);this.K.AddM(this.K3);this.K.Solve(N.tImpulse,-n,-a);n=N.tImpulse.x;a=N.tImpulse.y;l.m_sweep.c.x-=l.m_invMass*n;l.m_sweep.c.y-=l.m_invMass*a;l.m_sweep.a-=l.m_invI*(c*
a-d*n);j.m_sweep.c.x+=j.m_invMass*n;j.m_sweep.c.y+=j.m_invMass*a;j.m_sweep.a+=j.m_invI*(g*a-b*n);l.SynchronizeTransform();j.SynchronizeTransform();return h<=F.b2_linearSlop&&o<=F.b2_angularSlop};Box2D.postDefs.push(function(){Box2D.Dynamics.Joints.b2RevoluteJoint.tImpulse=new w});Box2D.inherit(S,Box2D.Dynamics.Joints.b2JointDef);S.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;S.b2RevoluteJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=
new w;this.localAnchorB=new w};S.prototype.b2RevoluteJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_revoluteJoint;this.localAnchorA.Set(0,0);this.localAnchorB.Set(0,0);this.motorSpeed=this.maxMotorTorque=this.upperAngle=this.lowerAngle=this.referenceAngle=0;this.enableMotor=this.enableLimit=false};S.prototype.Initialize=function(d,h,l){this.bodyA=d;this.bodyB=h;this.localAnchorA=this.bodyA.GetLocalPoint(l);this.localAnchorB=this.bodyB.GetLocalPoint(l);this.referenceAngle=this.bodyB.GetAngle()-
this.bodyA.GetAngle()};Box2D.inherit(aa,Box2D.Dynamics.Joints.b2Joint);aa.prototype.__super=Box2D.Dynamics.Joints.b2Joint.prototype;aa.b2WeldJoint=function(){Box2D.Dynamics.Joints.b2Joint.b2Joint.apply(this,arguments);this.m_localAnchorA=new w;this.m_localAnchorB=new w;this.m_impulse=new A;this.m_mass=new K};aa.prototype.GetAnchorA=function(){return this.m_bodyA.GetWorldPoint(this.m_localAnchorA)};aa.prototype.GetAnchorB=function(){return this.m_bodyB.GetWorldPoint(this.m_localAnchorB)};aa.prototype.GetReactionForce=
function(d){if(d===undefined)d=0;return new w(d*this.m_impulse.x,d*this.m_impulse.y)};aa.prototype.GetReactionTorque=function(d){if(d===undefined)d=0;return d*this.m_impulse.z};aa.prototype.b2WeldJoint=function(d){this.__super.b2Joint.call(this,d);this.m_localAnchorA.SetV(d.localAnchorA);this.m_localAnchorB.SetV(d.localAnchorB);this.m_referenceAngle=d.referenceAngle;this.m_impulse.SetZero();this.m_mass=new K};aa.prototype.InitVelocityConstraints=function(d){var h,l=0,j=this.m_bodyA,o=this.m_bodyB;
h=j.m_xf.R;var q=this.m_localAnchorA.x-j.m_sweep.localCenter.x,n=this.m_localAnchorA.y-j.m_sweep.localCenter.y;l=h.col1.x*q+h.col2.x*n;n=h.col1.y*q+h.col2.y*n;q=l;h=o.m_xf.R;var a=this.m_localAnchorB.x-o.m_sweep.localCenter.x,c=this.m_localAnchorB.y-o.m_sweep.localCenter.y;l=h.col1.x*a+h.col2.x*c;c=h.col1.y*a+h.col2.y*c;a=l;h=j.m_invMass;l=o.m_invMass;var g=j.m_invI,b=o.m_invI;this.m_mass.col1.x=h+l+n*n*g+c*c*b;this.m_mass.col2.x=-n*q*g-c*a*b;this.m_mass.col3.x=-n*g-c*b;this.m_mass.col1.y=this.m_mass.col2.x;
this.m_mass.col2.y=h+l+q*q*g+a*a*b;this.m_mass.col3.y=q*g+a*b;this.m_mass.col1.z=this.m_mass.col3.x;this.m_mass.col2.z=this.m_mass.col3.y;this.m_mass.col3.z=g+b;if(d.warmStarting){this.m_impulse.x*=d.dtRatio;this.m_impulse.y*=d.dtRatio;this.m_impulse.z*=d.dtRatio;j.m_linearVelocity.x-=h*this.m_impulse.x;j.m_linearVelocity.y-=h*this.m_impulse.y;j.m_angularVelocity-=g*(q*this.m_impulse.y-n*this.m_impulse.x+this.m_impulse.z);o.m_linearVelocity.x+=l*this.m_impulse.x;o.m_linearVelocity.y+=l*this.m_impulse.y;
o.m_angularVelocity+=b*(a*this.m_impulse.y-c*this.m_impulse.x+this.m_impulse.z)}else this.m_impulse.SetZero()};aa.prototype.SolveVelocityConstraints=function(){var d,h=0,l=this.m_bodyA,j=this.m_bodyB,o=l.m_linearVelocity,q=l.m_angularVelocity,n=j.m_linearVelocity,a=j.m_angularVelocity,c=l.m_invMass,g=j.m_invMass,b=l.m_invI,e=j.m_invI;d=l.m_xf.R;var f=this.m_localAnchorA.x-l.m_sweep.localCenter.x,m=this.m_localAnchorA.y-l.m_sweep.localCenter.y;h=d.col1.x*f+d.col2.x*m;m=d.col1.y*f+d.col2.y*m;f=h;d=
j.m_xf.R;var r=this.m_localAnchorB.x-j.m_sweep.localCenter.x,s=this.m_localAnchorB.y-j.m_sweep.localCenter.y;h=d.col1.x*r+d.col2.x*s;s=d.col1.y*r+d.col2.y*s;r=h;d=n.x-a*s-o.x+q*m;h=n.y+a*r-o.y-q*f;var v=a-q,t=new A;this.m_mass.Solve33(t,-d,-h,-v);this.m_impulse.Add(t);o.x-=c*t.x;o.y-=c*t.y;q-=b*(f*t.y-m*t.x+t.z);n.x+=g*t.x;n.y+=g*t.y;a+=e*(r*t.y-s*t.x+t.z);l.m_angularVelocity=q;j.m_angularVelocity=a};aa.prototype.SolvePositionConstraints=function(){var d,h=0,l=this.m_bodyA,j=this.m_bodyB;d=l.m_xf.R;
var o=this.m_localAnchorA.x-l.m_sweep.localCenter.x,q=this.m_localAnchorA.y-l.m_sweep.localCenter.y;h=d.col1.x*o+d.col2.x*q;q=d.col1.y*o+d.col2.y*q;o=h;d=j.m_xf.R;var n=this.m_localAnchorB.x-j.m_sweep.localCenter.x,a=this.m_localAnchorB.y-j.m_sweep.localCenter.y;h=d.col1.x*n+d.col2.x*a;a=d.col1.y*n+d.col2.y*a;n=h;d=l.m_invMass;h=j.m_invMass;var c=l.m_invI,g=j.m_invI,b=j.m_sweep.c.x+n-l.m_sweep.c.x-o,e=j.m_sweep.c.y+a-l.m_sweep.c.y-q,f=j.m_sweep.a-l.m_sweep.a-this.m_referenceAngle,m=10*F.b2_linearSlop,
r=Math.sqrt(b*b+e*e),s=y.Abs(f);if(r>m){c*=1;g*=1}this.m_mass.col1.x=d+h+q*q*c+a*a*g;this.m_mass.col2.x=-q*o*c-a*n*g;this.m_mass.col3.x=-q*c-a*g;this.m_mass.col1.y=this.m_mass.col2.x;this.m_mass.col2.y=d+h+o*o*c+n*n*g;this.m_mass.col3.y=o*c+n*g;this.m_mass.col1.z=this.m_mass.col3.x;this.m_mass.col2.z=this.m_mass.col3.y;this.m_mass.col3.z=c+g;m=new A;this.m_mass.Solve33(m,-b,-e,-f);l.m_sweep.c.x-=d*m.x;l.m_sweep.c.y-=d*m.y;l.m_sweep.a-=c*(o*m.y-q*m.x+m.z);j.m_sweep.c.x+=h*m.x;j.m_sweep.c.y+=h*m.y;
j.m_sweep.a+=g*(n*m.y-a*m.x+m.z);l.SynchronizeTransform();j.SynchronizeTransform();return r<=F.b2_linearSlop&&s<=F.b2_angularSlop};Box2D.inherit(Z,Box2D.Dynamics.Joints.b2JointDef);Z.prototype.__super=Box2D.Dynamics.Joints.b2JointDef.prototype;Z.b2WeldJointDef=function(){Box2D.Dynamics.Joints.b2JointDef.b2JointDef.apply(this,arguments);this.localAnchorA=new w;this.localAnchorB=new w};Z.prototype.b2WeldJointDef=function(){this.__super.b2JointDef.call(this);this.type=I.e_weldJoint;this.referenceAngle=
0};Z.prototype.Initialize=function(d,h,l){this.bodyA=d;this.bodyB=h;this.localAnchorA.SetV(this.bodyA.GetLocalPoint(l));this.localAnchorB.SetV(this.bodyB.GetLocalPoint(l));this.referenceAngle=this.bodyB.GetAngle()-this.bodyA.GetAngle()}})();
(function(){var F=Box2D.Dynamics.b2DebugDraw;F.b2DebugDraw=function(){this.m_xformScale=this.m_fillAlpha=this.m_alpha=this.m_lineThickness=this.m_drawScale=1;var G=this;this.m_sprite={graphics:{clear:function(){G.m_ctx.clearRect(0,0,G.m_ctx.canvas.width,G.m_ctx.canvas.height)}}}};F.prototype._color=function(G,K){return"rgba("+((G&16711680)>>16)+","+((G&65280)>>8)+","+(G&255)+","+K+")"};F.prototype.b2DebugDraw=function(){this.m_drawFlags=0};F.prototype.SetFlags=function(G){if(G===undefined)G=0;this.m_drawFlags=
G};F.prototype.GetFlags=function(){return this.m_drawFlags};F.prototype.AppendFlags=function(G){if(G===undefined)G=0;this.m_drawFlags|=G};F.prototype.ClearFlags=function(G){if(G===undefined)G=0;this.m_drawFlags&=~G};F.prototype.SetSprite=function(G){this.m_ctx=G};F.prototype.GetSprite=function(){return this.m_ctx};F.prototype.SetDrawScale=function(G){if(G===undefined)G=0;this.m_drawScale=G};F.prototype.GetDrawScale=function(){return this.m_drawScale};F.prototype.SetLineThickness=function(G){if(G===
undefined)G=0;this.m_lineThickness=G;this.m_ctx.strokeWidth=G};F.prototype.GetLineThickness=function(){return this.m_lineThickness};F.prototype.SetAlpha=function(G){if(G===undefined)G=0;this.m_alpha=G};F.prototype.GetAlpha=function(){return this.m_alpha};F.prototype.SetFillAlpha=function(G){if(G===undefined)G=0;this.m_fillAlpha=G};F.prototype.GetFillAlpha=function(){return this.m_fillAlpha};F.prototype.SetXFormScale=function(G){if(G===undefined)G=0;this.m_xformScale=G};F.prototype.GetXFormScale=function(){return this.m_xformScale};
F.prototype.DrawPolygon=function(G,K,y){if(K){var w=this.m_ctx,A=this.m_drawScale;w.beginPath();w.strokeStyle=this._color(y.color,this.m_alpha);w.moveTo(G[0].x*A,G[0].y*A);for(y=1;y<K;y++)w.lineTo(G[y].x*A,G[y].y*A);w.lineTo(G[0].x*A,G[0].y*A);w.closePath();w.stroke()}};F.prototype.DrawSolidPolygon=function(G,K,y){if(K){var w=this.m_ctx,A=this.m_drawScale;w.beginPath();w.strokeStyle=this._color(y.color,this.m_alpha);w.fillStyle=this._color(y.color,this.m_fillAlpha);w.moveTo(G[0].x*A,G[0].y*A);for(y=
1;y<K;y++)w.lineTo(G[y].x*A,G[y].y*A);w.lineTo(G[0].x*A,G[0].y*A);w.closePath();w.fill();w.stroke()}};F.prototype.DrawCircle=function(G,K,y){if(K){var w=this.m_ctx,A=this.m_drawScale;w.beginPath();w.strokeStyle=this._color(y.color,this.m_alpha);w.arc(G.x*A,G.y*A,K*A,0,Math.PI*2,true);w.closePath();w.stroke()}};F.prototype.DrawSolidCircle=function(G,K,y,w){if(K){var A=this.m_ctx,U=this.m_drawScale,p=G.x*U,B=G.y*U;A.moveTo(0,0);A.beginPath();A.strokeStyle=this._color(w.color,this.m_alpha);A.fillStyle=
this._color(w.color,this.m_fillAlpha);A.arc(p,B,K*U,0,Math.PI*2,true);A.moveTo(p,B);A.lineTo((G.x+y.x*K)*U,(G.y+y.y*K)*U);A.closePath();A.fill();A.stroke()}};F.prototype.DrawSegment=function(G,K,y){var w=this.m_ctx,A=this.m_drawScale;w.strokeStyle=this._color(y.color,this.m_alpha);w.beginPath();w.moveTo(G.x*A,G.y*A);w.lineTo(K.x*A,K.y*A);w.closePath();w.stroke()};F.prototype.DrawTransform=function(G){var K=this.m_ctx,y=this.m_drawScale;K.beginPath();K.strokeStyle=this._color(16711680,this.m_alpha);
K.moveTo(G.position.x*y,G.position.y*y);K.lineTo((G.position.x+this.m_xformScale*G.R.col1.x)*y,(G.position.y+this.m_xformScale*G.R.col1.y)*y);K.strokeStyle=this._color(65280,this.m_alpha);K.moveTo(G.position.x*y,G.position.y*y);K.lineTo((G.position.x+this.m_xformScale*G.R.col2.x)*y,(G.position.y+this.m_xformScale*G.R.col2.y)*y);K.closePath();K.stroke()}})();var i;for(i=0;i<Box2D.postDefs.length;++i)Box2D.postDefs[i]();delete Box2D.postDefs;

define("box2d", function(){});

/*
*
*   b2 - Box2dWeb wrapper
*
*   @author Yuji Ito @110chang
*
*/

define('app/b2',[
  'box2d'
], function(b2) {
  return {
    Vec2          : Box2D.Common.Math.b2Vec2,
    AABB          : Box2D.Collision.b2AABB,
    BodyDef       : Box2D.Dynamics.b2BodyDef,
    Body          : Box2D.Dynamics.b2Body,
    FixtureDef    : Box2D.Dynamics.b2FixtureDef,
    Fixture       : Box2D.Dynamics.b2Fixture,
    World         : Box2D.Dynamics.b2World,
    MassData      : Box2D.Collision.Shapes.b2MassData,
    PolygonShape  : Box2D.Collision.Shapes.b2PolygonShape,
    CircleShape   : Box2D.Collision.Shapes.b2CircleShape,
    DebugDraw     : Box2D.Dynamics.b2DebugDraw,
    MouseJointDef : Box2D.Dynamics.Joints.b2MouseJointDef,
    RevoluteJointDef : Box2D.Dynamics.Joints.b2RevoluteJointDef,
    DistanceJointDef : Box2D.Dynamics.Joints.b2DistanceJointDef
  };
});

/*!
* @license EaselJS
* Visit http://createjs.com/ for documentation, updates and examples.
*
* Copyright (c) 2011-2013 gskinner.com, inc.
*
* Distributed under the terms of the MIT license.
* http://www.opensource.org/licenses/mit-license.html
*
* This notice shall be included in all copies or substantial portions of the Software.
*/
this.createjs=this.createjs||{},createjs.extend=function(a,b){function c(){this.constructor=a}return c.prototype=b.prototype,a.prototype=new c},this.createjs=this.createjs||{},createjs.promote=function(a,b){var c=a.prototype,d=Object.getPrototypeOf&&Object.getPrototypeOf(c)||c.__proto__;if(d){c[(b+="_")+"constructor"]=d.constructor;for(var e in d)c.hasOwnProperty(e)&&"function"==typeof d[e]&&(c[b+e]=d[e])}return a},this.createjs=this.createjs||{},createjs.indexOf=function(a,b){for(var c=0,d=a.length;d>c;c++)if(b===a[c])return c;return-1},this.createjs=this.createjs||{},function(){function a(a,b,c){this.type=a,this.target=null,this.currentTarget=null,this.eventPhase=0,this.bubbles=!!b,this.cancelable=!!c,this.timeStamp=(new Date).getTime(),this.defaultPrevented=!1,this.propagationStopped=!1,this.immediatePropagationStopped=!1,this.removed=!1}var b=a.prototype;b.preventDefault=function(){this.defaultPrevented=this.cancelable&&!0},b.stopPropagation=function(){this.propagationStopped=!0},b.stopImmediatePropagation=function(){this.immediatePropagationStopped=this.propagationStopped=!0},b.remove=function(){this.removed=!0},b.clone=function(){return new a(this.type,this.bubbles,this.cancelable)},b.set=function(a){for(var b in a)this[b]=a[b];return this},b.toString=function(){return"[Event (type="+this.type+")]"},createjs.Event=a}(),this.createjs=this.createjs||{},function(){function a(){this._listeners=null,this._captureListeners=null}var b=a.prototype;a.initialize=function(a){a.addEventListener=b.addEventListener,a.on=b.on,a.removeEventListener=a.off=b.removeEventListener,a.removeAllEventListeners=b.removeAllEventListeners,a.hasEventListener=b.hasEventListener,a.dispatchEvent=b.dispatchEvent,a._dispatchEvent=b._dispatchEvent,a.willTrigger=b.willTrigger},b.addEventListener=function(a,b,c){var d;d=c?this._captureListeners=this._captureListeners||{}:this._listeners=this._listeners||{};var e=d[a];return e&&this.removeEventListener(a,b,c),e=d[a],e?e.push(b):d[a]=[b],b},b.on=function(a,b,c,d,e,f){return b.handleEvent&&(c=c||b,b=b.handleEvent),c=c||this,this.addEventListener(a,function(a){b.call(c,a,e),d&&a.remove()},f)},b.removeEventListener=function(a,b,c){var d=c?this._captureListeners:this._listeners;if(d){var e=d[a];if(e)for(var f=0,g=e.length;g>f;f++)if(e[f]==b){1==g?delete d[a]:e.splice(f,1);break}}},b.off=b.removeEventListener,b.removeAllEventListeners=function(a){a?(this._listeners&&delete this._listeners[a],this._captureListeners&&delete this._captureListeners[a]):this._listeners=this._captureListeners=null},b.dispatchEvent=function(a){if("string"==typeof a){var b=this._listeners;if(!b||!b[a])return!1;a=new createjs.Event(a)}else a.target&&a.clone&&(a=a.clone());try{a.target=this}catch(c){}if(a.bubbles&&this.parent){for(var d=this,e=[d];d.parent;)e.push(d=d.parent);var f,g=e.length;for(f=g-1;f>=0&&!a.propagationStopped;f--)e[f]._dispatchEvent(a,1+(0==f));for(f=1;g>f&&!a.propagationStopped;f++)e[f]._dispatchEvent(a,3)}else this._dispatchEvent(a,2);return a.defaultPrevented},b.hasEventListener=function(a){var b=this._listeners,c=this._captureListeners;return!!(b&&b[a]||c&&c[a])},b.willTrigger=function(a){for(var b=this;b;){if(b.hasEventListener(a))return!0;b=b.parent}return!1},b.toString=function(){return"[EventDispatcher]"},b._dispatchEvent=function(a,b){var c,d=1==b?this._captureListeners:this._listeners;if(a&&d){var e=d[a.type];if(!e||!(c=e.length))return;try{a.currentTarget=this}catch(f){}try{a.eventPhase=b}catch(f){}a.removed=!1,e=e.slice();for(var g=0;c>g&&!a.immediatePropagationStopped;g++){var h=e[g];h.handleEvent?h.handleEvent(a):h(a),a.removed&&(this.off(a.type,h,1==b),a.removed=!1)}}},createjs.EventDispatcher=a}(),this.createjs=this.createjs||{},function(){function a(){throw"Ticker cannot be instantiated."}a.RAF_SYNCHED="synched",a.RAF="raf",a.TIMEOUT="timeout",a.useRAF=!1,a.timingMode=null,a.maxDelta=0,a.paused=!1,a.removeEventListener=null,a.removeAllEventListeners=null,a.dispatchEvent=null,a.hasEventListener=null,a._listeners=null,createjs.EventDispatcher.initialize(a),a._addEventListener=a.addEventListener,a.addEventListener=function(){return!a._inited&&a.init(),a._addEventListener.apply(a,arguments)},a._inited=!1,a._startTime=0,a._pausedTime=0,a._ticks=0,a._pausedTicks=0,a._interval=50,a._lastTime=0,a._times=null,a._tickTimes=null,a._timerId=null,a._raf=!0,a.setInterval=function(b){a._interval=b,a._inited&&a._setupTick()},a.getInterval=function(){return a._interval},a.setFPS=function(b){a.setInterval(1e3/b)},a.getFPS=function(){return 1e3/a._interval};try{Object.defineProperties(a,{interval:{get:a.getInterval,set:a.setInterval},framerate:{get:a.getFPS,set:a.setFPS}})}catch(b){console.log(b)}a.init=function(){a._inited||(a._inited=!0,a._times=[],a._tickTimes=[],a._startTime=a._getTime(),a._times.push(a._lastTime=0),a.interval=a._interval)},a.reset=function(){if(a._raf){var b=window.cancelAnimationFrame||window.webkitCancelAnimationFrame||window.mozCancelAnimationFrame||window.oCancelAnimationFrame||window.msCancelAnimationFrame;b&&b(a._timerId)}else clearTimeout(a._timerId);a.removeAllEventListeners("tick"),a._timerId=a._times=a._tickTimes=null,a._startTime=a._lastTime=a._ticks=0,a._inited=!1},a.getMeasuredTickTime=function(b){var c=0,d=a._tickTimes;if(!d||d.length<1)return-1;b=Math.min(d.length,b||0|a.getFPS());for(var e=0;b>e;e++)c+=d[e];return c/b},a.getMeasuredFPS=function(b){var c=a._times;return!c||c.length<2?-1:(b=Math.min(c.length-1,b||0|a.getFPS()),1e3/((c[0]-c[b])/b))},a.setPaused=function(b){a.paused=b},a.getPaused=function(){return a.paused},a.getTime=function(b){return a._startTime?a._getTime()-(b?a._pausedTime:0):-1},a.getEventTime=function(b){return a._startTime?(a._lastTime||a._startTime)-(b?a._pausedTime:0):-1},a.getTicks=function(b){return a._ticks-(b?a._pausedTicks:0)},a._handleSynch=function(){a._timerId=null,a._setupTick(),a._getTime()-a._lastTime>=.97*(a._interval-1)&&a._tick()},a._handleRAF=function(){a._timerId=null,a._setupTick(),a._tick()},a._handleTimeout=function(){a._timerId=null,a._setupTick(),a._tick()},a._setupTick=function(){if(null==a._timerId){var b=a.timingMode||a.useRAF&&a.RAF_SYNCHED;if(b==a.RAF_SYNCHED||b==a.RAF){var c=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame;if(c)return a._timerId=c(b==a.RAF?a._handleRAF:a._handleSynch),void(a._raf=!0)}a._raf=!1,a._timerId=setTimeout(a._handleTimeout,a._interval)}},a._tick=function(){var b=a.paused,c=a._getTime(),d=c-a._lastTime;if(a._lastTime=c,a._ticks++,b&&(a._pausedTicks++,a._pausedTime+=d),a.hasEventListener("tick")){var e=new createjs.Event("tick"),f=a.maxDelta;e.delta=f&&d>f?f:d,e.paused=b,e.time=c,e.runTime=c-a._pausedTime,a.dispatchEvent(e)}for(a._tickTimes.unshift(a._getTime()-c);a._tickTimes.length>100;)a._tickTimes.pop();for(a._times.unshift(c);a._times.length>100;)a._times.pop()};var c=window.performance&&(performance.now||performance.mozNow||performance.msNow||performance.oNow||performance.webkitNow);a._getTime=function(){return(c&&c.call(performance)||(new Date).getTime())-a._startTime},createjs.Ticker=a}(),this.createjs=this.createjs||{},function(){function a(){throw"UID cannot be instantiated"}a._nextID=0,a.get=function(){return a._nextID++},createjs.UID=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d,e,f,g,h,i,j){this.Event_constructor(a,b,c),this.stageX=d,this.stageY=e,this.rawX=null==i?d:i,this.rawY=null==j?e:j,this.nativeEvent=f,this.pointerID=g,this.primary=!!h}var b=createjs.extend(a,createjs.Event);b._get_localX=function(){return this.currentTarget.globalToLocal(this.rawX,this.rawY).x},b._get_localY=function(){return this.currentTarget.globalToLocal(this.rawX,this.rawY).y},b._get_isTouch=function(){return-1!==this.pointerID};try{Object.defineProperties(b,{localX:{get:b._get_localX},localY:{get:b._get_localY},isTouch:{get:b._get_isTouch}})}catch(c){}b.clone=function(){return new a(this.type,this.bubbles,this.cancelable,this.stageX,this.stageY,this.nativeEvent,this.pointerID,this.primary,this.rawX,this.rawY)},b.toString=function(){return"[MouseEvent (type="+this.type+" stageX="+this.stageX+" stageY="+this.stageY+")]"},createjs.MouseEvent=createjs.promote(a,"Event")}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d,e,f){this.setValues(a,b,c,d,e,f)}var b=a.prototype;a.DEG_TO_RAD=Math.PI/180,a.identity=null,b.setValues=function(a,b,c,d,e,f){return this.a=null==a?1:a,this.b=b||0,this.c=c||0,this.d=null==d?1:d,this.tx=e||0,this.ty=f||0,this},b.append=function(a,b,c,d,e,f){var g=this.a,h=this.b,i=this.c,j=this.d;return(1!=a||0!=b||0!=c||1!=d)&&(this.a=g*a+i*b,this.b=h*a+j*b,this.c=g*c+i*d,this.d=h*c+j*d),this.tx=g*e+i*f+this.tx,this.ty=h*e+j*f+this.ty,this},b.prepend=function(a,b,c,d,e,f){var g=this.a,h=this.c,i=this.tx;return this.a=a*g+c*this.b,this.b=b*g+d*this.b,this.c=a*h+c*this.d,this.d=b*h+d*this.d,this.tx=a*i+c*this.ty+e,this.ty=b*i+d*this.ty+f,this},b.appendMatrix=function(a){return this.append(a.a,a.b,a.c,a.d,a.tx,a.ty)},b.prependMatrix=function(a){return this.prepend(a.a,a.b,a.c,a.d,a.tx,a.ty)},b.appendTransform=function(b,c,d,e,f,g,h,i,j){if(f%360)var k=f*a.DEG_TO_RAD,l=Math.cos(k),m=Math.sin(k);else l=1,m=0;return g||h?(g*=a.DEG_TO_RAD,h*=a.DEG_TO_RAD,this.append(Math.cos(h),Math.sin(h),-Math.sin(g),Math.cos(g),b,c),this.append(l*d,m*d,-m*e,l*e,0,0)):this.append(l*d,m*d,-m*e,l*e,b,c),(i||j)&&(this.tx-=i*this.a+j*this.c,this.ty-=i*this.b+j*this.d),this},b.prependTransform=function(b,c,d,e,f,g,h,i,j){if(f%360)var k=f*a.DEG_TO_RAD,l=Math.cos(k),m=Math.sin(k);else l=1,m=0;return(i||j)&&(this.tx-=i,this.ty-=j),g||h?(g*=a.DEG_TO_RAD,h*=a.DEG_TO_RAD,this.prepend(l*d,m*d,-m*e,l*e,0,0),this.prepend(Math.cos(h),Math.sin(h),-Math.sin(g),Math.cos(g),b,c)):this.prepend(l*d,m*d,-m*e,l*e,b,c),this},b.rotate=function(b){b*=a.DEG_TO_RAD;var c=Math.cos(b),d=Math.sin(b),e=this.a,f=this.b;return this.a=e*c+this.c*d,this.b=f*c+this.d*d,this.c=-e*d+this.c*c,this.d=-f*d+this.d*c,this},b.skew=function(b,c){return b*=a.DEG_TO_RAD,c*=a.DEG_TO_RAD,this.append(Math.cos(c),Math.sin(c),-Math.sin(b),Math.cos(b),0,0),this},b.scale=function(a,b){return this.a*=a,this.b*=a,this.c*=b,this.d*=b,this},b.translate=function(a,b){return this.tx+=this.a*a+this.c*b,this.ty+=this.b*a+this.d*b,this},b.identity=function(){return this.a=this.d=1,this.b=this.c=this.tx=this.ty=0,this},b.invert=function(){var a=this.a,b=this.b,c=this.c,d=this.d,e=this.tx,f=a*d-b*c;return this.a=d/f,this.b=-b/f,this.c=-c/f,this.d=a/f,this.tx=(c*this.ty-d*e)/f,this.ty=-(a*this.ty-b*e)/f,this},b.isIdentity=function(){return 0===this.tx&&0===this.ty&&1===this.a&&0===this.b&&0===this.c&&1===this.d},b.equals=function(a){return this.tx===a.tx&&this.ty===a.ty&&this.a===a.a&&this.b===a.b&&this.c===a.c&&this.d===a.d},b.transformPoint=function(a,b,c){return c=c||{},c.x=a*this.a+b*this.c+this.tx,c.y=a*this.b+b*this.d+this.ty,c},b.decompose=function(b){null==b&&(b={}),b.x=this.tx,b.y=this.ty,b.scaleX=Math.sqrt(this.a*this.a+this.b*this.b),b.scaleY=Math.sqrt(this.c*this.c+this.d*this.d);var c=Math.atan2(-this.c,this.d),d=Math.atan2(this.b,this.a),e=Math.abs(1-c/d);return 1e-5>e?(b.rotation=d/a.DEG_TO_RAD,this.a<0&&this.d>=0&&(b.rotation+=b.rotation<=0?180:-180),b.skewX=b.skewY=0):(b.skewX=c/a.DEG_TO_RAD,b.skewY=d/a.DEG_TO_RAD),b},b.copy=function(a){return this.setValues(a.a,a.b,a.c,a.d,a.tx,a.ty)},b.clone=function(){return new a(this.a,this.b,this.c,this.d,this.tx,this.ty)},b.toString=function(){return"[Matrix2D (a="+this.a+" b="+this.b+" c="+this.c+" d="+this.d+" tx="+this.tx+" ty="+this.ty+")]"},a.identity=new a,createjs.Matrix2D=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d,e){this.setValues(a,b,c,d,e)}var b=a.prototype;b.setValues=function(a,b,c,d,e){return this.visible=null==a?!0:!!a,this.alpha=null==b?1:b,this.shadow=c,this.compositeOperation=c,this.matrix=e||this.matrix&&this.matrix.identity()||new createjs.Matrix2D,this},b.append=function(a,b,c,d,e){return this.alpha*=b,this.shadow=c||this.shadow,this.compositeOperation=d||this.compositeOperation,this.visible=this.visible&&a,e&&this.matrix.appendMatrix(e),this},b.prepend=function(a,b,c,d,e){return this.alpha*=b,this.shadow=this.shadow||c,this.compositeOperation=this.compositeOperation||d,this.visible=this.visible&&a,e&&this.matrix.prependMatrix(e),this},b.identity=function(){return this.visible=!0,this.alpha=1,this.shadow=this.compositeOperation=null,this.matrix.identity(),this},b.clone=function(){return new a(this.alpha,this.shadow,this.compositeOperation,this.visible,this.matrix.clone())},createjs.DisplayProps=a}(),this.createjs=this.createjs||{},function(){function a(a,b){this.setValues(a,b)}var b=a.prototype;b.setValues=function(a,b){return this.x=a||0,this.y=b||0,this},b.copy=function(a){return this.x=a.x,this.y=a.y,this},b.clone=function(){return new a(this.x,this.y)},b.toString=function(){return"[Point (x="+this.x+" y="+this.y+")]"},createjs.Point=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d){this.setValues(a,b,c,d)}var b=a.prototype;b.setValues=function(a,b,c,d){return this.x=a||0,this.y=b||0,this.width=c||0,this.height=d||0,this},b.extend=function(a,b,c,d){return c=c||0,d=d||0,a+c>this.x+this.width&&(this.width=a+c-this.x),b+d>this.y+this.height&&(this.height=b+d-this.y),a<this.x&&(this.width+=this.x-a,this.x=a),b<this.y&&(this.height+=this.y-b,this.y=b),this},b.pad=function(a,b,c,d){return this.x-=a,this.y-=b,this.width+=a+c,this.height+=b+d,this},b.copy=function(a){return this.setValues(a.x,a.y,a.width,a.height)},b.contains=function(a,b,c,d){return c=c||0,d=d||0,a>=this.x&&a+c<=this.x+this.width&&b>=this.y&&b+d<=this.y+this.height},b.union=function(a){return this.clone().extend(a.x,a.y,a.width,a.height)},b.intersection=function(b){var c=b.x,d=b.y,e=c+b.width,f=d+b.height;return this.x>c&&(c=this.x),this.y>d&&(d=this.y),this.x+this.width<e&&(e=this.x+this.width),this.y+this.height<f&&(f=this.y+this.height),c>=e||d>=f?null:new a(c,d,e-c,f-d)},b.intersects=function(a){return a.x<=this.x+this.width&&this.x<=a.x+a.width&&a.y<=this.y+this.height&&this.y<=a.y+a.height},b.isEmpty=function(){return this.width<=0||this.height<=0},b.clone=function(){return new a(this.x,this.y,this.width,this.height)},b.toString=function(){return"[Rectangle (x="+this.x+" y="+this.y+" width="+this.width+" height="+this.height+")]"},createjs.Rectangle=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d,e,f,g){a.addEventListener&&(this.target=a,this.overLabel=null==c?"over":c,this.outLabel=null==b?"out":b,this.downLabel=null==d?"down":d,this.play=e,this._isPressed=!1,this._isOver=!1,this._enabled=!1,a.mouseChildren=!1,this.enabled=!0,this.handleEvent({}),f&&(g&&(f.actionsEnabled=!1,f.gotoAndStop&&f.gotoAndStop(g)),a.hitArea=f))}var b=a.prototype;b.setEnabled=function(a){if(a!=this._enabled){var b=this.target;this._enabled=a,a?(b.cursor="pointer",b.addEventListener("rollover",this),b.addEventListener("rollout",this),b.addEventListener("mousedown",this),b.addEventListener("pressup",this)):(b.cursor=null,b.removeEventListener("rollover",this),b.removeEventListener("rollout",this),b.removeEventListener("mousedown",this),b.removeEventListener("pressup",this))}},b.getEnabled=function(){return this._enabled};try{Object.defineProperties(b,{enabled:{get:b.getEnabled,set:b.setEnabled}})}catch(c){}b.toString=function(){return"[ButtonHelper]"},b.handleEvent=function(a){var b,c=this.target,d=a.type;"mousedown"==d?(this._isPressed=!0,b=this.downLabel):"pressup"==d?(this._isPressed=!1,b=this._isOver?this.overLabel:this.outLabel):"rollover"==d?(this._isOver=!0,b=this._isPressed?this.downLabel:this.overLabel):(this._isOver=!1,b=this._isPressed?this.overLabel:this.outLabel),this.play?c.gotoAndPlay&&c.gotoAndPlay(b):c.gotoAndStop&&c.gotoAndStop(b)},createjs.ButtonHelper=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d){this.color=a||"black",this.offsetX=b||0,this.offsetY=c||0,this.blur=d||0}var b=a.prototype;a.identity=new a("transparent",0,0,0),b.toString=function(){return"[Shadow]"},b.clone=function(){return new a(this.color,this.offsetX,this.offsetY,this.blur)},createjs.Shadow=a}(),this.createjs=this.createjs||{},function(){function a(a){this.EventDispatcher_constructor(),this.complete=!0,this.framerate=0,this._animations=null,this._frames=null,this._images=null,this._data=null,this._loadCount=0,this._frameHeight=0,this._frameWidth=0,this._numFrames=0,this._regX=0,this._regY=0,this._spacing=0,this._margin=0,this._parseData(a)}var b=createjs.extend(a,createjs.EventDispatcher);b.getAnimations=function(){return this._animations.slice()};try{Object.defineProperties(b,{animations:{get:b.getAnimations}})}catch(c){}b.getNumFrames=function(a){if(null==a)return this._frames?this._frames.length:this._numFrames||0;var b=this._data[a];return null==b?0:b.frames.length},b.getAnimation=function(a){return this._data[a]},b.getFrame=function(a){var b;return this._frames&&(b=this._frames[a])?b:null},b.getFrameBounds=function(a,b){var c=this.getFrame(a);return c?(b||new createjs.Rectangle).setValues(-c.regX,-c.regY,c.rect.width,c.rect.height):null},b.toString=function(){return"[SpriteSheet]"},b.clone=function(){throw"SpriteSheet cannot be cloned."},b._parseData=function(a){var b,c,d,e;if(null!=a){if(this.framerate=a.framerate||0,a.images&&(c=a.images.length)>0)for(e=this._images=[],b=0;c>b;b++){var f=a.images[b];if("string"==typeof f){var g=f;f=document.createElement("img"),f.src=g}e.push(f),f.getContext||f.complete||(this._loadCount++,this.complete=!1,function(a){f.onload=function(){a._handleImageLoad()}}(this))}if(null==a.frames);else if(a.frames instanceof Array)for(this._frames=[],e=a.frames,b=0,c=e.length;c>b;b++){var h=e[b];this._frames.push({image:this._images[h[4]?h[4]:0],rect:new createjs.Rectangle(h[0],h[1],h[2],h[3]),regX:h[5]||0,regY:h[6]||0})}else d=a.frames,this._frameWidth=d.width,this._frameHeight=d.height,this._regX=d.regX||0,this._regY=d.regY||0,this._spacing=d.spacing||0,this._margin=d.margin||0,this._numFrames=d.count,0==this._loadCount&&this._calculateFrames();if(this._animations=[],null!=(d=a.animations)){this._data={};var i;for(i in d){var j={name:i},k=d[i];if("number"==typeof k)e=j.frames=[k];else if(k instanceof Array)if(1==k.length)j.frames=[k[0]];else for(j.speed=k[3],j.next=k[2],e=j.frames=[],b=k[0];b<=k[1];b++)e.push(b);else{j.speed=k.speed,j.next=k.next;var l=k.frames;e=j.frames="number"==typeof l?[l]:l.slice(0)}(j.next===!0||void 0===j.next)&&(j.next=i),(j.next===!1||e.length<2&&j.next==i)&&(j.next=null),j.speed||(j.speed=1),this._animations.push(i),this._data[i]=j}}}},b._handleImageLoad=function(){0==--this._loadCount&&(this._calculateFrames(),this.complete=!0,this.dispatchEvent("complete"))},b._calculateFrames=function(){if(!this._frames&&0!=this._frameWidth){this._frames=[];var a=this._numFrames||1e5,b=0,c=this._frameWidth,d=this._frameHeight,e=this._spacing,f=this._margin;a:for(var g=0,h=this._images;g<h.length;g++)for(var i=h[g],j=i.width,k=i.height,l=f;k-f-d>=l;){for(var m=f;j-f-c>=m;){if(b>=a)break a;b++,this._frames.push({image:i,rect:new createjs.Rectangle(m,l,c,d),regX:this._regX,regY:this._regY}),m+=c+e}l+=d+e}this._numFrames=b}},createjs.SpriteSheet=createjs.promote(a,"EventDispatcher")}(),this.createjs=this.createjs||{},function(){function a(){this.command=null,this._stroke=null,this._strokeStyle=null,this._strokeIgnoreScale=!1,this._fill=null,this._instructions=[],this._commitIndex=0,this._activeInstructions=[],this._dirty=!1,this._storeIndex=0,this.clear()}var b=a.prototype,c=a;a.getRGB=function(a,b,c,d){return null!=a&&null==c&&(d=b,c=255&a,b=a>>8&255,a=a>>16&255),null==d?"rgb("+a+","+b+","+c+")":"rgba("+a+","+b+","+c+","+d+")"},a.getHSL=function(a,b,c,d){return null==d?"hsl("+a%360+","+b+"%,"+c+"%)":"hsla("+a%360+","+b+"%,"+c+"%,"+d+")"},a.BASE_64={A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25,a:26,b:27,c:28,d:29,e:30,f:31,g:32,h:33,i:34,j:35,k:36,l:37,m:38,n:39,o:40,p:41,q:42,r:43,s:44,t:45,u:46,v:47,w:48,x:49,y:50,z:51,0:52,1:53,2:54,3:55,4:56,5:57,6:58,7:59,8:60,9:61,"+":62,"/":63},a.STROKE_CAPS_MAP=["butt","round","square"],a.STROKE_JOINTS_MAP=["miter","round","bevel"];var d=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas");d.getContext&&(a._ctx=d.getContext("2d"),d.width=d.height=1),b.getInstructions=function(){return this._updateInstructions(),this._instructions};try{Object.defineProperties(b,{instructions:{get:b.getInstructions}})}catch(e){}b.isEmpty=function(){return!(this._instructions.length||this._activeInstructions.length)},b.draw=function(a,b){this._updateInstructions();for(var c=this._instructions,d=this._storeIndex,e=c.length;e>d;d++)c[d].exec(a,b)},b.drawAsPath=function(a){this._updateInstructions();for(var b,c=this._instructions,d=this._storeIndex,e=c.length;e>d;d++)(b=c[d]).path!==!1&&b.exec(a)},b.moveTo=function(a,b){return this.append(new c.MoveTo(a,b),!0)},b.lineTo=function(a,b){return this.append(new c.LineTo(a,b))},b.arcTo=function(a,b,d,e,f){return this.append(new c.ArcTo(a,b,d,e,f))},b.arc=function(a,b,d,e,f,g){return this.append(new c.Arc(a,b,d,e,f,g))},b.quadraticCurveTo=function(a,b,d,e){return this.append(new c.QuadraticCurveTo(a,b,d,e))},b.bezierCurveTo=function(a,b,d,e,f,g){return this.append(new c.BezierCurveTo(a,b,d,e,f,g))},b.rect=function(a,b,d,e){return this.append(new c.Rect(a,b,d,e))},b.closePath=function(){return this._activeInstructions.length?this.append(new c.ClosePath):this},b.clear=function(){return this._instructions.length=this._activeInstructions.length=this._commitIndex=0,this._strokeStyle=this._stroke=this._fill=null,this._dirty=this._strokeIgnoreScale=!1,this},b.beginFill=function(a){return this._setFill(a?new c.Fill(a):null)},b.beginLinearGradientFill=function(a,b,d,e,f,g){return this._setFill((new c.Fill).linearGradient(a,b,d,e,f,g))},b.beginRadialGradientFill=function(a,b,d,e,f,g,h,i){return this._setFill((new c.Fill).radialGradient(a,b,d,e,f,g,h,i))},b.beginBitmapFill=function(a,b,d){return this._setFill(new c.Fill(null,d).bitmap(a,b))},b.endFill=function(){return this.beginFill()},b.setStrokeStyle=function(a,b,d,e,f){return this._updateInstructions(!0),this._strokeStyle=this.command=new c.StrokeStyle(a,b,d,e,f),this._stroke&&(this._stroke.ignoreScale=f),this._strokeIgnoreScale=f,this},b.beginStroke=function(a){return this._setStroke(a?new c.Stroke(a):null)},b.beginLinearGradientStroke=function(a,b,d,e,f,g){return this._setStroke((new c.Stroke).linearGradient(a,b,d,e,f,g))},b.beginRadialGradientStroke=function(a,b,d,e,f,g,h,i){return this._setStroke((new c.Stroke).radialGradient(a,b,d,e,f,g,h,i))},b.beginBitmapStroke=function(a,b){return this._setStroke((new c.Stroke).bitmap(a,b))},b.endStroke=function(){return this.beginStroke()},b.curveTo=b.quadraticCurveTo,b.drawRect=b.rect,b.drawRoundRect=function(a,b,c,d,e){return this.drawRoundRectComplex(a,b,c,d,e,e,e,e)},b.drawRoundRectComplex=function(a,b,d,e,f,g,h,i){return this.append(new c.RoundRect(a,b,d,e,f,g,h,i))},b.drawCircle=function(a,b,d){return this.append(new c.Circle(a,b,d))},b.drawEllipse=function(a,b,d,e){return this.append(new c.Ellipse(a,b,d,e))},b.drawPolyStar=function(a,b,d,e,f,g){return this.append(new c.PolyStar(a,b,d,e,f,g))},b.append=function(a,b){return this._activeInstructions.push(a),this.command=a,b||(this._dirty=!0),this},b.decodePath=function(b){for(var c=[this.moveTo,this.lineTo,this.quadraticCurveTo,this.bezierCurveTo,this.closePath],d=[2,2,4,6,0],e=0,f=b.length,g=[],h=0,i=0,j=a.BASE_64;f>e;){var k=b.charAt(e),l=j[k],m=l>>3,n=c[m];if(!n||3&l)throw"bad path data (@"+e+"): "+k;var o=d[m];m||(h=i=0),g.length=0,e++;for(var p=(l>>2&1)+2,q=0;o>q;q++){var r=j[b.charAt(e)],s=r>>5?-1:1;r=(31&r)<<6|j[b.charAt(e+1)],3==p&&(r=r<<6|j[b.charAt(e+2)]),r=s*r/10,q%2?h=r+=h:i=r+=i,g[q]=r,e+=p}n.apply(this,g)}return this},b.store=function(){return this._updateInstructions(!0),this._storeIndex=this._instructions.length,this},b.unstore=function(){return this._storeIndex=0,this},b.clone=function(){var b=new a;return b.command=this.command,b._stroke=this._stroke,b._strokeStyle=this._strokeStyle,b._strokeIgnoreScale=this._strokeIgnoreScale,b._fill=this._fill,b._instructions=this._instructions.slice(),b._commitIndex=this._commitIndex,b._activeInstructions=this._activeInstructions.slice(),b._dirty=this._dirty,b._storeIndex=this._storeIndex,b},b.toString=function(){return"[Graphics]"},b.mt=b.moveTo,b.lt=b.lineTo,b.at=b.arcTo,b.bt=b.bezierCurveTo,b.qt=b.quadraticCurveTo,b.a=b.arc,b.r=b.rect,b.cp=b.closePath,b.c=b.clear,b.f=b.beginFill,b.lf=b.beginLinearGradientFill,b.rf=b.beginRadialGradientFill,b.bf=b.beginBitmapFill,b.ef=b.endFill,b.ss=b.setStrokeStyle,b.s=b.beginStroke,b.ls=b.beginLinearGradientStroke,b.rs=b.beginRadialGradientStroke,b.bs=b.beginBitmapStroke,b.es=b.endStroke,b.dr=b.drawRect,b.rr=b.drawRoundRect,b.rc=b.drawRoundRectComplex,b.dc=b.drawCircle,b.de=b.drawEllipse,b.dp=b.drawPolyStar,b.p=b.decodePath,b._updateInstructions=function(b){var c=this._instructions,d=this._activeInstructions,e=this._commitIndex;if(this._dirty&&d.length){c.length=e,c.push(a.beginCmd);var f=d.length,g=c.length;c.length=g+f;for(var h=0;f>h;h++)c[h+g]=d[h];this._fill&&c.push(this._fill),this._stroke&&this._strokeStyle&&c.push(this._strokeStyle),this._stroke&&c.push(this._stroke),this._dirty=!1}b&&(d.length=0,this._commitIndex=c.length)},b._setFill=function(a){return this._updateInstructions(!0),(this._fill=a)&&(this.command=a),this},b._setStroke=function(a){return this._updateInstructions(!0),(this._stroke=a)&&(this.command=a,a.ignoreScale=this._strokeIgnoreScale),this},(c.LineTo=function(a,b){this.x=a,this.y=b}).prototype.exec=function(a){a.lineTo(this.x,this.y)},(c.MoveTo=function(a,b){this.x=a,this.y=b}).prototype.exec=function(a){a.moveTo(this.x,this.y)},(c.ArcTo=function(a,b,c,d,e){this.x1=a,this.y1=b,this.x2=c,this.y2=d,this.radius=e}).prototype.exec=function(a){a.arcTo(this.x1,this.y1,this.x2,this.y2,this.radius)},(c.Arc=function(a,b,c,d,e,f){this.x=a,this.y=b,this.radius=c,this.startAngle=d,this.endAngle=e,this.anticlockwise=!!f}).prototype.exec=function(a){a.arc(this.x,this.y,this.radius,this.startAngle,this.endAngle,this.anticlockwise)},(c.QuadraticCurveTo=function(a,b,c,d){this.cpx=a,this.cpy=b,this.x=c,this.y=d}).prototype.exec=function(a){a.quadraticCurveTo(this.cpx,this.cpy,this.x,this.y)},(c.BezierCurveTo=function(a,b,c,d,e,f){this.cp1x=a,this.cp1y=b,this.cp2x=c,this.cp2y=d,this.x=e,this.y=f}).prototype.exec=function(a){a.bezierCurveTo(this.cp1x,this.cp1y,this.cp2x,this.cp2y,this.x,this.y)},(c.Rect=function(a,b,c,d){this.x=a,this.y=b,this.w=c,this.h=d}).prototype.exec=function(a){a.rect(this.x,this.y,this.w,this.h)},(c.ClosePath=function(){}).prototype.exec=function(a){a.closePath()},(c.BeginPath=function(){}).prototype.exec=function(a){a.beginPath()},b=(c.Fill=function(a,b){this.style=a,this.matrix=b}).prototype,b.exec=function(a){if(this.style){a.fillStyle=this.style;var b=this.matrix;b&&(a.save(),a.transform(b.a,b.b,b.c,b.d,b.tx,b.ty)),a.fill(),b&&a.restore()}},b.linearGradient=function(b,c,d,e,f,g){for(var h=this.style=a._ctx.createLinearGradient(d,e,f,g),i=0,j=b.length;j>i;i++)h.addColorStop(c[i],b[i]);return h.props={colors:b,ratios:c,x0:d,y0:e,x1:f,y1:g,type:"linear"},this},b.radialGradient=function(b,c,d,e,f,g,h,i){for(var j=this.style=a._ctx.createRadialGradient(d,e,f,g,h,i),k=0,l=b.length;l>k;k++)j.addColorStop(c[k],b[k]);return j.props={colors:b,ratios:c,x0:d,y0:e,r0:f,x1:g,y1:h,r1:i,type:"radial"},this},b.bitmap=function(b,c){var d=this.style=a._ctx.createPattern(b,c||"");return d.props={image:b,repetition:c,type:"bitmap"},this},b.path=!1,b=(c.Stroke=function(a,b){this.style=a,this.ignoreScale=b}).prototype,b.exec=function(a){this.style&&(a.strokeStyle=this.style,this.ignoreScale&&(a.save(),a.setTransform(1,0,0,1,0,0)),a.stroke(),this.ignoreScale&&a.restore())},b.linearGradient=c.Fill.prototype.linearGradient,b.radialGradient=c.Fill.prototype.radialGradient,b.bitmap=c.Fill.prototype.bitmap,b.path=!1,b=(c.StrokeStyle=function(a,b,c,d){this.width=a,this.caps=b,this.joints=c,this.miterLimit=d}).prototype,b.exec=function(b){b.lineWidth=null==this.width?"1":this.width,b.lineCap=null==this.caps?"butt":isNaN(this.caps)?this.caps:a.STROKE_CAPS_MAP[this.caps],b.lineJoin=null==this.joints?"miter":isNaN(this.joints)?this.joints:a.STROKE_JOINTS_MAP[this.joints],b.miterLimit=null==this.miterLimit?"10":this.miterLimit},b.path=!1,(c.RoundRect=function(a,b,c,d,e,f,g,h){this.x=a,this.y=b,this.w=c,this.h=d,this.radiusTL=e,this.radiusTR=f,this.radiusBR=g,this.radiusBL=h}).prototype.exec=function(a){var b=(j>i?i:j)/2,c=0,d=0,e=0,f=0,g=this.x,h=this.y,i=this.w,j=this.h,k=this.radiusTL,l=this.radiusTR,m=this.radiusBR,n=this.radiusBL;0>k&&(k*=c=-1),k>b&&(k=b),0>l&&(l*=d=-1),l>b&&(l=b),0>m&&(m*=e=-1),m>b&&(m=b),0>n&&(n*=f=-1),n>b&&(n=b),a.moveTo(g+i-l,h),a.arcTo(g+i+l*d,h-l*d,g+i,h+l,l),a.lineTo(g+i,h+j-m),a.arcTo(g+i+m*e,h+j+m*e,g+i-m,h+j,m),a.lineTo(g+n,h+j),a.arcTo(g-n*f,h+j+n*f,g,h+j-n,n),a.lineTo(g,h+k),a.arcTo(g-k*c,h-k*c,g+k,h,k),a.closePath()},(c.Circle=function(a,b,c){this.x=a,this.y=b,this.radius=c}).prototype.exec=function(a){a.arc(this.x,this.y,this.radius,0,2*Math.PI)},(c.Ellipse=function(a,b,c,d){this.x=a,this.y=b,this.w=c,this.h=d}).prototype.exec=function(a){var b=this.x,c=this.y,d=this.w,e=this.h,f=.5522848,g=d/2*f,h=e/2*f,i=b+d,j=c+e,k=b+d/2,l=c+e/2;a.moveTo(b,l),a.bezierCurveTo(b,l-h,k-g,c,k,c),a.bezierCurveTo(k+g,c,i,l-h,i,l),a.bezierCurveTo(i,l+h,k+g,j,k,j),a.bezierCurveTo(k-g,j,b,l+h,b,l)},(c.PolyStar=function(a,b,c,d,e,f){this.x=a,this.y=b,this.radius=c,this.sides=d,this.pointSize=e,this.angle=f}).prototype.exec=function(a){var b=this.x,c=this.y,d=this.radius,e=(this.angle||0)/180*Math.PI,f=this.sides,g=1-(this.pointSize||0),h=Math.PI/f;a.moveTo(b+Math.cos(e)*d,c+Math.sin(e)*d);for(var i=0;f>i;i++)e+=h,1!=g&&a.lineTo(b+Math.cos(e)*d*g,c+Math.sin(e)*d*g),e+=h,a.lineTo(b+Math.cos(e)*d,c+Math.sin(e)*d);a.closePath()},a.beginCmd=new c.BeginPath,createjs.Graphics=a}(),this.createjs=this.createjs||{},function(){function a(){this.EventDispatcher_constructor(),this.alpha=1,this.cacheCanvas=null,this.cacheID=0,this.id=createjs.UID.get(),this.mouseEnabled=!0,this.tickEnabled=!0,this.name=null,this.parent=null,this.regX=0,this.regY=0,this.rotation=0,this.scaleX=1,this.scaleY=1,this.skewX=0,this.skewY=0,this.shadow=null,this.visible=!0,this.x=0,this.y=0,this.transformMatrix=null,this.compositeOperation=null,this.snapToPixel=!0,this.filters=null,this.mask=null,this.hitArea=null,this.cursor=null,this._cacheOffsetX=0,this._cacheOffsetY=0,this._filterOffsetX=0,this._filterOffsetY=0,this._cacheScale=1,this._cacheDataURLID=0,this._cacheDataURL=null,this._props=new createjs.DisplayProps,this._rectangle=new createjs.Rectangle,this._bounds=null}var b=createjs.extend(a,createjs.EventDispatcher);a._MOUSE_EVENTS=["click","dblclick","mousedown","mouseout","mouseover","pressmove","pressup","rollout","rollover"],a.suppressCrossDomainErrors=!1,a._snapToPixelEnabled=!1;var c=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas");c.getContext&&(a._hitTestCanvas=c,a._hitTestContext=c.getContext("2d"),c.width=c.height=1),a._nextCacheID=1,b.getStage=function(){for(var a=this,b=createjs.Stage;a.parent;)a=a.parent;return a instanceof b?a:null};try{Object.defineProperties(b,{stage:{get:b.getStage}})}catch(d){}b.isVisible=function(){return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY)},b.draw=function(a,b){var c=this.cacheCanvas;if(b||!c)return!1;var d=this._cacheScale;return a.drawImage(c,this._cacheOffsetX+this._filterOffsetX,this._cacheOffsetY+this._filterOffsetY,c.width/d,c.height/d),!0},b.updateContext=function(b){var c=this,d=c.mask,e=c._props.matrix;
d&&d.graphics&&!d.graphics.isEmpty()&&(d.getMatrix(e),b.transform(e.a,e.b,e.c,e.d,e.tx,e.ty),d.graphics.drawAsPath(b),b.clip(),e.invert(),b.transform(e.a,e.b,e.c,e.d,e.tx,e.ty)),this.getMatrix(e);var f=e.tx,g=e.ty;a._snapToPixelEnabled&&c.snapToPixel&&(f=f+(0>f?-.5:.5)|0,g=g+(0>g?-.5:.5)|0),b.transform(e.a,e.b,e.c,e.d,f,g),b.globalAlpha*=c.alpha,c.compositeOperation&&(b.globalCompositeOperation=c.compositeOperation),c.shadow&&this._applyShadow(b,c.shadow)},b.cache=function(a,b,c,d,e){e=e||1,this.cacheCanvas||(this.cacheCanvas=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas")),this._cacheWidth=c,this._cacheHeight=d,this._cacheOffsetX=a,this._cacheOffsetY=b,this._cacheScale=e,this.updateCache()},b.updateCache=function(b){var c=this.cacheCanvas;if(!c)throw"cache() must be called before updateCache()";var d=this._cacheScale,e=this._cacheOffsetX*d,f=this._cacheOffsetY*d,g=this._cacheWidth,h=this._cacheHeight,i=c.getContext("2d"),j=this._getFilterBounds();e+=this._filterOffsetX=j.x,f+=this._filterOffsetY=j.y,g=Math.ceil(g*d)+j.width,h=Math.ceil(h*d)+j.height,g!=c.width||h!=c.height?(c.width=g,c.height=h):b||i.clearRect(0,0,g+1,h+1),i.save(),i.globalCompositeOperation=b,i.setTransform(d,0,0,d,-e,-f),this.draw(i,!0),this._applyFilters(),i.restore(),this.cacheID=a._nextCacheID++},b.uncache=function(){this._cacheDataURL=this.cacheCanvas=null,this.cacheID=this._cacheOffsetX=this._cacheOffsetY=this._filterOffsetX=this._filterOffsetY=0,this._cacheScale=1},b.getCacheDataURL=function(){return this.cacheCanvas?(this.cacheID!=this._cacheDataURLID&&(this._cacheDataURL=this.cacheCanvas.toDataURL()),this._cacheDataURL):null},b.localToGlobal=function(a,b,c){return this.getConcatenatedMatrix(this._props.matrix).transformPoint(a,b,c||new createjs.Point)},b.globalToLocal=function(a,b,c){return this.getConcatenatedMatrix(this._props.matrix).invert().transformPoint(a,b,c||new createjs.Point)},b.localToLocal=function(a,b,c,d){return d=this.localToGlobal(a,b,d),c.globalToLocal(d.x,d.y,d)},b.setTransform=function(a,b,c,d,e,f,g,h,i){return this.x=a||0,this.y=b||0,this.scaleX=null==c?1:c,this.scaleY=null==d?1:d,this.rotation=e||0,this.skewX=f||0,this.skewY=g||0,this.regX=h||0,this.regY=i||0,this},b.getMatrix=function(a){var b=this,c=a&&a.identity()||new createjs.Matrix2D;return b.transformMatrix?c.copy(b.transformMatrix):c.appendTransform(b.x,b.y,b.scaleX,b.scaleY,b.rotation,b.skewX,b.skewY,b.regX,b.regY)},b.getConcatenatedMatrix=function(a){for(var b=this,c=this.getMatrix(a);b=b.parent;)c.prependMatrix(b.getMatrix(b._props.matrix));return c},b.getConcatenatedDisplayProps=function(a){a=a?a.identity():new createjs.DisplayProps;var b=this,c=b.getMatrix(a.matrix);do a.prepend(b.visible,b.alpha,b.shadow,b.compositeOperation),b!=this&&c.prependMatrix(b.getMatrix(b._props.matrix));while(b=b.parent);return a},b.hitTest=function(b,c){var d=a._hitTestContext;d.setTransform(1,0,0,1,-b,-c),this.draw(d);var e=this._testHit(d);return d.setTransform(1,0,0,1,0,0),d.clearRect(0,0,2,2),e},b.set=function(a){for(var b in a)this[b]=a[b];return this},b.getBounds=function(){if(this._bounds)return this._rectangle.copy(this._bounds);var a=this.cacheCanvas;if(a){var b=this._cacheScale;return this._rectangle.setValues(this._cacheOffsetX,this._cacheOffsetY,a.width/b,a.height/b)}return null},b.getTransformedBounds=function(){return this._getBounds()},b.setBounds=function(a,b,c,d){null==a&&(this._bounds=a),this._bounds=(this._bounds||new createjs.Rectangle).setValues(a,b,c,d)},b.clone=function(){return this._cloneProps(new a)},b.toString=function(){return"[DisplayObject (name="+this.name+")]"},b._cloneProps=function(a){return a.alpha=this.alpha,a.mouseEnabled=this.mouseEnabled,a.tickEnabled=this.tickEnabled,a.name=this.name,a.regX=this.regX,a.regY=this.regY,a.rotation=this.rotation,a.scaleX=this.scaleX,a.scaleY=this.scaleY,a.shadow=this.shadow,a.skewX=this.skewX,a.skewY=this.skewY,a.visible=this.visible,a.x=this.x,a.y=this.y,a.compositeOperation=this.compositeOperation,a.snapToPixel=this.snapToPixel,a.filters=null==this.filters?null:this.filters.slice(0),a.mask=this.mask,a.hitArea=this.hitArea,a.cursor=this.cursor,a._bounds=this._bounds,a},b._applyShadow=function(a,b){b=b||Shadow.identity,a.shadowColor=b.color,a.shadowOffsetX=b.offsetX,a.shadowOffsetY=b.offsetY,a.shadowBlur=b.blur},b._tick=function(a){var b=this._listeners;b&&b.tick&&(a.target=null,a.propagationStopped=a.immediatePropagationStopped=!1,this.dispatchEvent(a))},b._testHit=function(b){try{var c=b.getImageData(0,0,1,1).data[3]>1}catch(d){if(!a.suppressCrossDomainErrors)throw"An error has occurred. This is most likely due to security restrictions on reading canvas pixel data with local or cross-domain images."}return c},b._applyFilters=function(){if(this.filters&&0!=this.filters.length&&this.cacheCanvas)for(var a=this.filters.length,b=this.cacheCanvas.getContext("2d"),c=this.cacheCanvas.width,d=this.cacheCanvas.height,e=0;a>e;e++)this.filters[e].applyFilter(b,0,0,c,d)},b._getFilterBounds=function(){var a,b=this.filters,c=this._rectangle.setValues(0,0,0,0);if(!b||!(a=b.length))return c;for(var d=0;a>d;d++){var e=this.filters[d];e.getBounds&&e.getBounds(c)}return c},b._getBounds=function(a,b){return this._transformBounds(this.getBounds(),a,b)},b._transformBounds=function(a,b,c){if(!a)return a;var d=a.x,e=a.y,f=a.width,g=a.height,h=this._props.matrix;h=c?h.identity():this.getMatrix(h),(d||e)&&h.appendTransform(0,0,1,1,0,0,0,-d,-e),b&&h.prependMatrix(b);var i=f*h.a,j=f*h.b,k=g*h.c,l=g*h.d,m=h.tx,n=h.ty,o=m,p=m,q=n,r=n;return(d=i+m)<o?o=d:d>p&&(p=d),(d=i+k+m)<o?o=d:d>p&&(p=d),(d=k+m)<o?o=d:d>p&&(p=d),(e=j+n)<q?q=e:e>r&&(r=e),(e=j+l+n)<q?q=e:e>r&&(r=e),(e=l+n)<q?q=e:e>r&&(r=e),a.setValues(o,q,p-o,r-q)},b._hasMouseEventListener=function(){for(var b=a._MOUSE_EVENTS,c=0,d=b.length;d>c;c++)if(this.hasEventListener(b[c]))return!0;return!!this.cursor},createjs.DisplayObject=createjs.promote(a,"EventDispatcher")}(),this.createjs=this.createjs||{},function(){function a(){this.DisplayObject_constructor(),this.children=[],this.mouseChildren=!0,this.tickChildren=!0}var b=createjs.extend(a,createjs.DisplayObject);b.getNumChildren=function(){return this.children.length};try{Object.defineProperties(b,{numChildren:{get:b.getNumChildren}})}catch(c){}b.initialize=a,b.isVisible=function(){var a=this.cacheCanvas||this.children.length;return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY&&a)},b.draw=function(a,b){if(this.DisplayObject_draw(a,b))return!0;for(var c=this.children.slice(),d=0,e=c.length;e>d;d++){var f=c[d];f.isVisible()&&(a.save(),f.updateContext(a),f.draw(a),a.restore())}return!0},b.addChild=function(a){if(null==a)return a;var b=arguments.length;if(b>1){for(var c=0;b>c;c++)this.addChild(arguments[c]);return arguments[b-1]}return a.parent&&a.parent.removeChild(a),a.parent=this,this.children.push(a),a.dispatchEvent("added"),a},b.addChildAt=function(a,b){var c=arguments.length,d=arguments[c-1];if(0>d||d>this.children.length)return arguments[c-2];if(c>2){for(var e=0;c-1>e;e++)this.addChildAt(arguments[e],d+e);return arguments[c-2]}return a.parent&&a.parent.removeChild(a),a.parent=this,this.children.splice(b,0,a),a.dispatchEvent("added"),a},b.removeChild=function(a){var b=arguments.length;if(b>1){for(var c=!0,d=0;b>d;d++)c=c&&this.removeChild(arguments[d]);return c}return this.removeChildAt(createjs.indexOf(this.children,a))},b.removeChildAt=function(a){var b=arguments.length;if(b>1){for(var c=[],d=0;b>d;d++)c[d]=arguments[d];c.sort(function(a,b){return b-a});for(var e=!0,d=0;b>d;d++)e=e&&this.removeChildAt(c[d]);return e}if(0>a||a>this.children.length-1)return!1;var f=this.children[a];return f&&(f.parent=null),this.children.splice(a,1),f.dispatchEvent("removed"),!0},b.removeAllChildren=function(){for(var a=this.children;a.length;)this.removeChildAt(0)},b.getChildAt=function(a){return this.children[a]},b.getChildByName=function(a){for(var b=this.children,c=0,d=b.length;d>c;c++)if(b[c].name==a)return b[c];return null},b.sortChildren=function(a){this.children.sort(a)},b.getChildIndex=function(a){return createjs.indexOf(this.children,a)},b.swapChildrenAt=function(a,b){var c=this.children,d=c[a],e=c[b];d&&e&&(c[a]=e,c[b]=d)},b.swapChildren=function(a,b){for(var c,d,e=this.children,f=0,g=e.length;g>f&&(e[f]==a&&(c=f),e[f]==b&&(d=f),null==c||null==d);f++);f!=g&&(e[c]=b,e[d]=a)},b.setChildIndex=function(a,b){var c=this.children,d=c.length;if(!(a.parent!=this||0>b||b>=d)){for(var e=0;d>e&&c[e]!=a;e++);e!=d&&e!=b&&(c.splice(e,1),c.splice(b,0,a))}},b.contains=function(a){for(;a;){if(a==this)return!0;a=a.parent}return!1},b.hitTest=function(a,b){return null!=this.getObjectUnderPoint(a,b)},b.getObjectsUnderPoint=function(a,b,c){var d=[],e=this.localToGlobal(a,b);return this._getObjectsUnderPoint(e.x,e.y,d,c>0,1==c),d},b.getObjectUnderPoint=function(a,b,c){var d=this.localToGlobal(a,b);return this._getObjectsUnderPoint(d.x,d.y,null,c>0,1==c)},b.getBounds=function(){return this._getBounds(null,!0)},b.getTransformedBounds=function(){return this._getBounds()},b.clone=function(b){var c=this._cloneProps(new a);return b&&this._cloneChildren(c),c},b.toString=function(){return"[Container (name="+this.name+")]"},b._tick=function(a){if(this.tickChildren)for(var b=this.children.length-1;b>=0;b--){var c=this.children[b];c.tickEnabled&&c._tick&&c._tick(a)}this.DisplayObject__tick(a)},b._cloneChildren=function(a){a.children.length&&a.removeAllChildren();for(var b=a.children,c=0,d=this.children.length;d>c;c++){var e=this.children[c].clone(!0);e.parent=a,b.push(e)}},b._getObjectsUnderPoint=function(b,c,d,e,f,g){if(g=g||0,!g&&!this._testMask(this,b,c))return null;var h,i=createjs.DisplayObject._hitTestContext;f=f||e&&this._hasMouseEventListener();for(var j=this.children,k=j.length,l=k-1;l>=0;l--){var m=j[l],n=m.hitArea;if(m.visible&&(n||m.isVisible())&&(!e||m.mouseEnabled)&&(n||this._testMask(m,b,c)))if(!n&&m instanceof a){var o=m._getObjectsUnderPoint(b,c,d,e,f,g+1);if(!d&&o)return e&&!this.mouseChildren?this:o}else{if(e&&!f&&!m._hasMouseEventListener())continue;var p=m.getConcatenatedDisplayProps(m._props);if(h=p.matrix,n&&(h.appendMatrix(n.getMatrix(n._props.matrix)),p.alpha=n.alpha),i.globalAlpha=p.alpha,i.setTransform(h.a,h.b,h.c,h.d,h.tx-b,h.ty-c),(n||m).draw(i),!this._testHit(i))continue;if(i.setTransform(1,0,0,1,0,0),i.clearRect(0,0,2,2),!d)return e&&!this.mouseChildren?this:m;d.push(m)}}return null},b._testMask=function(a,b,c){var d=a.mask;if(!d||!d.graphics||d.graphics.isEmpty())return!0;var e=this._props.matrix,f=a.parent;e=f?f.getConcatenatedMatrix(e):e.identity(),e=d.getMatrix(d._props.matrix).prependMatrix(e);var g=createjs.DisplayObject._hitTestContext;return g.setTransform(e.a,e.b,e.c,e.d,e.tx-b,e.ty-c),d.graphics.drawAsPath(g),g.fillStyle="#000",g.fill(),this._testHit(g)?(g.setTransform(1,0,0,1,0,0),g.clearRect(0,0,2,2),!0):!1},b._getBounds=function(a,b){var c=this.DisplayObject_getBounds();if(c)return this._transformBounds(c,a,b);var d=this._props.matrix;d=b?d.identity():this.getMatrix(d),a&&d.prependMatrix(a);for(var e=this.children.length,f=null,g=0;e>g;g++){var h=this.children[g];h.visible&&(c=h._getBounds(d))&&(f?f.extend(c.x,c.y,c.width,c.height):f=c.clone())}return f},createjs.Container=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(a){this.Container_constructor(),this.autoClear=!0,this.canvas="string"==typeof a?document.getElementById(a):a,this.mouseX=0,this.mouseY=0,this.drawRect=null,this.snapToPixelEnabled=!1,this.mouseInBounds=!1,this.tickOnUpdate=!0,this.mouseMoveOutside=!1,this.preventSelection=!0,this._pointerData={},this._pointerCount=0,this._primaryPointerID=null,this._mouseOverIntervalID=null,this._nextStage=null,this._prevStage=null,this.enableDOMEvents(!0)}var b=createjs.extend(a,createjs.Container);b._get_nextStage=function(){return this._nextStage},b._set_nextStage=function(a){this._nextStage&&(this._nextStage._prevStage=null),a&&(a._prevStage=this),this._nextStage=a};try{Object.defineProperties(b,{nextStage:{get:b._get_nextStage,set:b._set_nextStage}})}catch(c){}b.update=function(a){if(this.canvas&&(this.tickOnUpdate&&this.tick(a),!this.dispatchEvent("drawstart"))){createjs.DisplayObject._snapToPixelEnabled=this.snapToPixelEnabled;var b=this.drawRect,c=this.canvas.getContext("2d");c.setTransform(1,0,0,1,0,0),this.autoClear&&(b?c.clearRect(b.x,b.y,b.width,b.height):c.clearRect(0,0,this.canvas.width+1,this.canvas.height+1)),c.save(),this.drawRect&&(c.beginPath(),c.rect(b.x,b.y,b.width,b.height),c.clip()),this.updateContext(c),this.draw(c,!1),c.restore(),this.dispatchEvent("drawend")}},b.tick=function(a){if(this.tickEnabled&&!this.dispatchEvent("tickstart")){var b=new createjs.Event("tick");if(a)for(var c in a)a.hasOwnProperty(c)&&(b[c]=a[c]);this._tick(b),this.dispatchEvent("tickend")}},b.handleEvent=function(a){"tick"==a.type&&this.update(a)},b.clear=function(){if(this.canvas){var a=this.canvas.getContext("2d");a.setTransform(1,0,0,1,0,0),a.clearRect(0,0,this.canvas.width+1,this.canvas.height+1)}},b.toDataURL=function(a,b){var c,d=this.canvas.getContext("2d"),e=this.canvas.width,f=this.canvas.height;if(a){c=d.getImageData(0,0,e,f);var g=d.globalCompositeOperation;d.globalCompositeOperation="destination-over",d.fillStyle=a,d.fillRect(0,0,e,f)}var h=this.canvas.toDataURL(b||"image/png");return a&&(d.putImageData(c,0,0),d.globalCompositeOperation=g),h},b.enableMouseOver=function(a){if(this._mouseOverIntervalID&&(clearInterval(this._mouseOverIntervalID),this._mouseOverIntervalID=null,0==a&&this._testMouseOver(!0)),null==a)a=20;else if(0>=a)return;var b=this;this._mouseOverIntervalID=setInterval(function(){b._testMouseOver()},1e3/Math.min(50,a))},b.enableDOMEvents=function(a){null==a&&(a=!0);var b,c,d=this._eventListeners;if(!a&&d){for(b in d)c=d[b],c.t.removeEventListener(b,c.f,!1);this._eventListeners=null}else if(a&&!d&&this.canvas){var e=window.addEventListener?window:document,f=this;d=this._eventListeners={},d.mouseup={t:e,f:function(a){f._handleMouseUp(a)}},d.mousemove={t:e,f:function(a){f._handleMouseMove(a)}},d.dblclick={t:this.canvas,f:function(a){f._handleDoubleClick(a)}},d.mousedown={t:this.canvas,f:function(a){f._handleMouseDown(a)}};for(b in d)c=d[b],c.t.addEventListener(b,c.f,!1)}},b.clone=function(){throw"Stage cannot be cloned."},b.toString=function(){return"[Stage (name="+this.name+")]"},b._getElementRect=function(a){var b;try{b=a.getBoundingClientRect()}catch(c){b={top:a.offsetTop,left:a.offsetLeft,width:a.offsetWidth,height:a.offsetHeight}}var d=(window.pageXOffset||document.scrollLeft||0)-(document.clientLeft||document.body.clientLeft||0),e=(window.pageYOffset||document.scrollTop||0)-(document.clientTop||document.body.clientTop||0),f=window.getComputedStyle?getComputedStyle(a,null):a.currentStyle,g=parseInt(f.paddingLeft)+parseInt(f.borderLeftWidth),h=parseInt(f.paddingTop)+parseInt(f.borderTopWidth),i=parseInt(f.paddingRight)+parseInt(f.borderRightWidth),j=parseInt(f.paddingBottom)+parseInt(f.borderBottomWidth);return{left:b.left+d+g,right:b.right+d-i,top:b.top+e+h,bottom:b.bottom+e-j}},b._getPointerData=function(a){var b=this._pointerData[a];return b||(b=this._pointerData[a]={x:0,y:0}),b},b._handleMouseMove=function(a){a||(a=window.event),this._handlePointerMove(-1,a,a.pageX,a.pageY)},b._handlePointerMove=function(a,b,c,d,e){if((!this._prevStage||void 0!==e)&&this.canvas){var f=this._nextStage,g=this._getPointerData(a),h=g.inBounds;this._updatePointerPosition(a,b,c,d),(h||g.inBounds||this.mouseMoveOutside)&&(-1===a&&g.inBounds==!h&&this._dispatchMouseEvent(this,h?"mouseleave":"mouseenter",!1,a,g,b),this._dispatchMouseEvent(this,"stagemousemove",!1,a,g,b),this._dispatchMouseEvent(g.target,"pressmove",!0,a,g,b)),f&&f._handlePointerMove(a,b,c,d,null)}},b._updatePointerPosition=function(a,b,c,d){var e=this._getElementRect(this.canvas);c-=e.left,d-=e.top;var f=this.canvas.width,g=this.canvas.height;c/=(e.right-e.left)/f,d/=(e.bottom-e.top)/g;var h=this._getPointerData(a);(h.inBounds=c>=0&&d>=0&&f-1>=c&&g-1>=d)?(h.x=c,h.y=d):this.mouseMoveOutside&&(h.x=0>c?0:c>f-1?f-1:c,h.y=0>d?0:d>g-1?g-1:d),h.posEvtObj=b,h.rawX=c,h.rawY=d,(a===this._primaryPointerID||-1===a)&&(this.mouseX=h.x,this.mouseY=h.y,this.mouseInBounds=h.inBounds)},b._handleMouseUp=function(a){this._handlePointerUp(-1,a,!1)},b._handlePointerUp=function(a,b,c,d){var e=this._nextStage,f=this._getPointerData(a);if(!this._prevStage||void 0!==d){f.down&&this._dispatchMouseEvent(this,"stagemouseup",!1,a,f,b),f.down=!1;var g=null,h=f.target;d||!h&&!e||(g=this._getObjectsUnderPoint(f.x,f.y,null,!0)),g==h&&this._dispatchMouseEvent(h,"click",!0,a,f,b),this._dispatchMouseEvent(h,"pressup",!0,a,f,b),c?(a==this._primaryPointerID&&(this._primaryPointerID=null),delete this._pointerData[a]):f.target=null,e&&e._handlePointerUp(a,b,c,d||g&&this)}},b._handleMouseDown=function(a){this._handlePointerDown(-1,a,a.pageX,a.pageY)},b._handlePointerDown=function(a,b,c,d,e){this.preventSelection&&b.preventDefault(),(null==this._primaryPointerID||-1===a)&&(this._primaryPointerID=a),null!=d&&this._updatePointerPosition(a,b,c,d);var f=null,g=this._nextStage,h=this._getPointerData(a);h.inBounds&&(this._dispatchMouseEvent(this,"stagemousedown",!1,a,h,b),h.down=!0),e||(f=h.target=this._getObjectsUnderPoint(h.x,h.y,null,!0),this._dispatchMouseEvent(h.target,"mousedown",!0,a,h,b)),g&&g._handlePointerDown(a,b,c,d,e||f&&this)},b._testMouseOver=function(a,b,c){if(!this._prevStage||void 0!==b){var d=this._nextStage;if(!this._mouseOverIntervalID)return void(d&&d._testMouseOver(a,b,c));var e=this._getPointerData(-1);if(e&&(a||this.mouseX!=this._mouseOverX||this.mouseY!=this._mouseOverY||!this.mouseInBounds)){var f,g,h,i=e.posEvtObj,j=c||i&&i.target==this.canvas,k=null,l=-1,m="";!b&&(a||this.mouseInBounds&&j)&&(k=this._getObjectsUnderPoint(this.mouseX,this.mouseY,null,!0),this._mouseOverX=this.mouseX,this._mouseOverY=this.mouseY);var n=this._mouseOverTarget||[],o=n[n.length-1],p=this._mouseOverTarget=[];for(f=k;f;)p.unshift(f),null!=f.cursor&&(m=f.cursor),f=f.parent;for(this.canvas.style.cursor=m,!b&&c&&(c.canvas.style.cursor=m),g=0,h=p.length;h>g&&p[g]==n[g];g++)l=g;for(o!=k&&this._dispatchMouseEvent(o,"mouseout",!0,-1,e,i),g=n.length-1;g>l;g--)this._dispatchMouseEvent(n[g],"rollout",!1,-1,e,i);for(g=p.length-1;g>l;g--)this._dispatchMouseEvent(p[g],"rollover",!1,-1,e,i);o!=k&&this._dispatchMouseEvent(k,"mouseover",!0,-1,e,i),d&&d._testMouseOver(a,b||k&&this,c||j&&this)}}},b._handleDoubleClick=function(a,b){var c=null,d=this._nextStage,e=this._getPointerData(-1);b||(c=this._getObjectsUnderPoint(e.x,e.y,null,!0),this._dispatchMouseEvent(c,"dblclick",!0,-1,e,a)),d&&d._handleDoubleClick(a,b||c&&this)},b._dispatchMouseEvent=function(a,b,c,d,e,f){if(a&&(c||a.hasEventListener(b))){var g=new createjs.MouseEvent(b,c,!1,e.x,e.y,f,d,d===this._primaryPointerID||-1===d,e.rawX,e.rawY);a.dispatchEvent(g)}},createjs.Stage=createjs.promote(a,"Container")}(),this.createjs=this.createjs||{},function(){function a(a){this.DisplayObject_constructor(),"string"==typeof a?(this.image=document.createElement("img"),this.image.src=a):this.image=a,this.sourceRect=null}var b=createjs.extend(a,createjs.DisplayObject);b.initialize=a,b.isVisible=function(){var a=this.cacheCanvas||this.image&&(this.image.complete||this.image.getContext||this.image.readyState>=2);return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY&&a)},b.draw=function(a,b){if(this.DisplayObject_draw(a,b)||!this.image)return!0;var c=this.image,d=this.sourceRect;if(d){var e=d.x,f=d.y,g=e+d.width,h=f+d.height,i=0,j=0,k=c.width,l=c.height;0>e&&(i-=e,e=0),g>k&&(g=k),0>f&&(j-=f,f=0),h>l&&(h=l),a.drawImage(c,e,f,g-e,h-f,i,j,g-e,h-f)}else a.drawImage(c,0,0);return!0},b.getBounds=function(){var a=this.DisplayObject_getBounds();if(a)return a;var b=this.sourceRect||this.image,c=this.image&&(this.image.complete||this.image.getContext||this.image.readyState>=2);return c?this._rectangle.setValues(0,0,b.width,b.height):null},b.clone=function(){var b=new a(this.image);return this.sourceRect&&(b.sourceRect=this.sourceRect.clone()),this._cloneProps(b),b},b.toString=function(){return"[Bitmap (name="+this.name+")]"},createjs.Bitmap=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(a,b){this.DisplayObject_constructor(),this.currentFrame=0,this.currentAnimation=null,this.paused=!0,this.spriteSheet=a,this.currentAnimationFrame=0,this.framerate=0,this._animation=null,this._currentFrame=null,this._skipAdvance=!1,b&&this.gotoAndPlay(b)}var b=createjs.extend(a,createjs.DisplayObject);b.isVisible=function(){var a=this.cacheCanvas||this.spriteSheet.complete;return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY&&a)},b.draw=function(a,b){if(this.DisplayObject_draw(a,b))return!0;this._normalizeFrame();var c=this.spriteSheet.getFrame(0|this._currentFrame);if(!c)return!1;var d=c.rect;return d.width&&d.height&&a.drawImage(c.image,d.x,d.y,d.width,d.height,-c.regX,-c.regY,d.width,d.height),!0},b.play=function(){this.paused=!1},b.stop=function(){this.paused=!0},b.gotoAndPlay=function(a){this.paused=!1,this._skipAdvance=!0,this._goto(a)},b.gotoAndStop=function(a){this.paused=!0,this._goto(a)},b.advance=function(a){var b=this.framerate||this.spriteSheet.framerate,c=b&&null!=a?a/(1e3/b):1;this._normalizeFrame(c)},b.getBounds=function(){return this.DisplayObject_getBounds()||this.spriteSheet.getFrameBounds(this.currentFrame,this._rectangle)},b.clone=function(){return this._cloneProps(new a(this.spriteSheet))},b.toString=function(){return"[Sprite (name="+this.name+")]"},b._cloneProps=function(a){return this.DisplayObject__cloneProps(a),a.currentFrame=this.currentFrame,a.currentAnimation=this.currentAnimation,a.paused=this.paused,a.currentAnimationFrame=this.currentAnimationFrame,a.framerate=this.framerate,a._animation=this._animation,a._currentFrame=this._currentFrame,a._skipAdvance=this._skipAdvance,a},b._tick=function(a){this.paused||(this._skipAdvance||this.advance(a&&a.delta),this._skipAdvance=!1),this.DisplayObject__tick(a)},b._normalizeFrame=function(a){a=a||0;var b,c=this._animation,d=this.paused,e=this._currentFrame;if(c){var f=c.speed||1,g=this.currentAnimationFrame;if(b=c.frames.length,g+a*f>=b){var h=c.next;if(this._dispatchAnimationEnd(c,e,d,h,b-1))return;if(h)return this._goto(h,a-(b-g)/f);this.paused=!0,g=c.frames.length-1}else g+=a*f;this.currentAnimationFrame=g,this._currentFrame=c.frames[0|g]}else if(e=this._currentFrame+=a,b=this.spriteSheet.getNumFrames(),e>=b&&b>0&&!this._dispatchAnimationEnd(c,e,d,b-1)&&(this._currentFrame-=b)>=b)return this._normalizeFrame();e=0|this._currentFrame,this.currentFrame!=e&&(this.currentFrame=e,this.dispatchEvent("change"))},b._dispatchAnimationEnd=function(a,b,c,d,e){var f=a?a.name:null;if(this.hasEventListener("animationend")){var g=new createjs.Event("animationend");g.name=f,g.next=d,this.dispatchEvent(g)}var h=this._animation!=a||this._currentFrame!=b;return h||c||!this.paused||(this.currentAnimationFrame=e,h=!0),h},b._goto=function(a,b){if(this.currentAnimationFrame=0,isNaN(a)){var c=this.spriteSheet.getAnimation(a);c&&(this._animation=c,this.currentAnimation=a,this._normalizeFrame(b))}else this.currentAnimation=this._animation=null,this._currentFrame=a,this._normalizeFrame()},createjs.Sprite=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(a){this.DisplayObject_constructor(),this.graphics=a?a:new createjs.Graphics}var b=createjs.extend(a,createjs.DisplayObject);b.isVisible=function(){var a=this.cacheCanvas||this.graphics&&!this.graphics.isEmpty();return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY&&a)},b.draw=function(a,b){return this.DisplayObject_draw(a,b)?!0:(this.graphics.draw(a,this),!0)},b.clone=function(b){var c=b&&this.graphics?this.graphics.clone():this.graphics;return this._cloneProps(new a(c))},b.toString=function(){return"[Shape (name="+this.name+")]"},createjs.Shape=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(a,b,c){this.DisplayObject_constructor(),this.text=a,this.font=b,this.color=c,this.textAlign="left",this.textBaseline="top",this.maxWidth=null,this.outline=0,this.lineHeight=0,this.lineWidth=null}var b=createjs.extend(a,createjs.DisplayObject),c=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas");c.getContext&&(a._workingContext=c.getContext("2d"),c.width=c.height=1),a.H_OFFSETS={start:0,left:0,center:-.5,end:-1,right:-1},a.V_OFFSETS={top:0,hanging:-.01,middle:-.4,alphabetic:-.8,ideographic:-.85,bottom:-1},b.isVisible=function(){var a=this.cacheCanvas||null!=this.text&&""!==this.text;return!!(this.visible&&this.alpha>0&&0!=this.scaleX&&0!=this.scaleY&&a)},b.draw=function(a,b){if(this.DisplayObject_draw(a,b))return!0;var c=this.color||"#000";return this.outline?(a.strokeStyle=c,a.lineWidth=1*this.outline):a.fillStyle=c,this._drawText(this._prepContext(a)),!0},b.getMeasuredWidth=function(){return this._getMeasuredWidth(this.text)},b.getMeasuredLineHeight=function(){return 1.2*this._getMeasuredWidth("M")},b.getMeasuredHeight=function(){return this._drawText(null,{}).height},b.getBounds=function(){var b=this.DisplayObject_getBounds();if(b)return b;if(null==this.text||""==this.text)return null;var c=this._drawText(null,{}),d=this.maxWidth&&this.maxWidth<c.width?this.maxWidth:c.width,e=d*a.H_OFFSETS[this.textAlign||"left"],f=this.lineHeight||this.getMeasuredLineHeight(),g=f*a.V_OFFSETS[this.textBaseline||"top"];return this._rectangle.setValues(e,g,d,c.height)},b.getMetrics=function(){var b={lines:[]};return b.lineHeight=this.lineHeight||this.getMeasuredLineHeight(),b.vOffset=b.lineHeight*a.V_OFFSETS[this.textBaseline||"top"],this._drawText(null,b,b.lines)},b.clone=function(){return this._cloneProps(new a(this.text,this.font,this.color))},b.toString=function(){return"[Text (text="+(this.text.length>20?this.text.substr(0,17)+"...":this.text)+")]"},b._cloneProps=function(a){return this.DisplayObject__cloneProps(a),a.textAlign=this.textAlign,a.textBaseline=this.textBaseline,a.maxWidth=this.maxWidth,a.outline=this.outline,a.lineHeight=this.lineHeight,a.lineWidth=this.lineWidth,a},b._prepContext=function(a){return a.font=this.font||"10px sans-serif",a.textAlign=this.textAlign||"left",a.textBaseline=this.textBaseline||"top",a},b._drawText=function(b,c,d){var e=!!b;e||(b=a._workingContext,b.save(),this._prepContext(b));for(var f=this.lineHeight||this.getMeasuredLineHeight(),g=0,h=0,i=String(this.text).split(/(?:\r\n|\r|\n)/),j=0,k=i.length;k>j;j++){var l=i[j],m=null;if(null!=this.lineWidth&&(m=b.measureText(l).width)>this.lineWidth){var n=l.split(/(\s)/);l=n[0],m=b.measureText(l).width;for(var o=1,p=n.length;p>o;o+=2){var q=b.measureText(n[o]+n[o+1]).width;m+q>this.lineWidth?(e&&this._drawTextLine(b,l,h*f),d&&d.push(l),m>g&&(g=m),l=n[o+1],m=b.measureText(l).width,h++):(l+=n[o]+n[o+1],m+=q)}}e&&this._drawTextLine(b,l,h*f),d&&d.push(l),c&&null==m&&(m=b.measureText(l).width),m>g&&(g=m),h++}return c&&(c.width=g,c.height=h*f),e||b.restore(),c},b._drawTextLine=function(a,b,c){this.outline?a.strokeText(b,0,c,this.maxWidth||65535):a.fillText(b,0,c,this.maxWidth||65535)},b._getMeasuredWidth=function(b){var c=a._workingContext;c.save();var d=this._prepContext(c).measureText(b).width;return c.restore(),d},createjs.Text=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(a,b){this.Container_constructor(),this.text=a||"",this.spriteSheet=b,this.lineHeight=0,this.letterSpacing=0,this.spaceWidth=0,this._oldProps={text:0,spriteSheet:0,lineHeight:0,letterSpacing:0,spaceWidth:0}}var b=createjs.extend(a,createjs.Container);a.maxPoolSize=100,a._spritePool=[],b.draw=function(a,b){this.DisplayObject_draw(a,b)||(this._updateText(),this.Container_draw(a,b))},b.getBounds=function(){return this._updateText(),this.Container_getBounds()},b.isVisible=function(){var a=this.cacheCanvas||this.spriteSheet&&this.spriteSheet.complete&&this.text;return!!(this.visible&&this.alpha>0&&0!==this.scaleX&&0!==this.scaleY&&a)},b.clone=function(){return this._cloneProps(new a(this.text,this.spriteSheet))},b.addChild=b.addChildAt=b.removeChild=b.removeChildAt=b.removeAllChildren=function(){},b._cloneProps=function(a){return this.DisplayObject__cloneProps(a),a.lineHeight=this.lineHeight,a.letterSpacing=this.letterSpacing,a.spaceWidth=this.spaceWidth,a},b._getFrameIndex=function(a,b){var c,d=b.getAnimation(a);return d||(a!=(c=a.toUpperCase())||a!=(c=a.toLowerCase())||(c=null),c&&(d=b.getAnimation(c))),d&&d.frames[0]},b._getFrame=function(a,b){var c=this._getFrameIndex(a,b);return null==c?c:b.getFrame(c)},b._getLineHeight=function(a){var b=this._getFrame("1",a)||this._getFrame("T",a)||this._getFrame("L",a)||a.getFrame(0);return b?b.rect.height:1},b._getSpaceWidth=function(a){var b=this._getFrame("1",a)||this._getFrame("l",a)||this._getFrame("e",a)||this._getFrame("a",a)||a.getFrame(0);return b?b.rect.width:1},b._updateText=function(){var b,c=0,d=0,e=this._oldProps,f=!1,g=this.spaceWidth,h=this.lineHeight,i=this.spriteSheet,j=a._spritePool,k=this.children,l=0,m=k.length;for(var n in e)e[n]!=this[n]&&(e[n]=this[n],f=!0);if(f){var o=!!this._getFrame(" ",i);o||g||(g=this._getSpaceWidth(i)),h||(h=this._getLineHeight(i));for(var p=0,q=this.text.length;q>p;p++){var r=this.text.charAt(p);if(" "!=r||o)if("\n"!=r&&"\r"!=r){var s=this._getFrameIndex(r,i);null!=s&&(m>l?b=k[l]:(k.push(b=j.length?j.pop():new createjs.Sprite),b.parent=this,m++),b.spriteSheet=i,b.gotoAndStop(s),b.x=c,b.y=d,l++,c+=b.getBounds().width+this.letterSpacing)}else"\r"==r&&"\n"==this.text.charAt(p+1)&&p++,c=0,d+=h;else c+=g}for(;m>l;)j.push(b=k.pop()),b.parent=null,m--;j.length>a.maxPoolSize&&(j.length=a.maxPoolSize)}},createjs.BitmapText=createjs.promote(a,"Container")}(),this.createjs=this.createjs||{},function(){function a(){throw"SpriteSheetUtils cannot be instantiated"}var b=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas");b.getContext&&(a._workingCanvas=b,a._workingContext=b.getContext("2d"),b.width=b.height=1),a.addFlippedFrames=function(b,c,d,e){if(c||d||e){var f=0;c&&a._flip(b,++f,!0,!1),d&&a._flip(b,++f,!1,!0),e&&a._flip(b,++f,!0,!0)}},a.extractFrame=function(b,c){isNaN(c)&&(c=b.getAnimation(c).frames[0]);var d=b.getFrame(c);if(!d)return null;var e=d.rect,f=a._workingCanvas;f.width=e.width,f.height=e.height,a._workingContext.drawImage(d.image,e.x,e.y,e.width,e.height,0,0,e.width,e.height);var g=document.createElement("img");return g.src=f.toDataURL("image/png"),g},a.mergeAlpha=function(a,b,c){c||(c=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas")),c.width=Math.max(b.width,a.width),c.height=Math.max(b.height,a.height);var d=c.getContext("2d");return d.save(),d.drawImage(a,0,0),d.globalCompositeOperation="destination-in",d.drawImage(b,0,0),d.restore(),c},a._flip=function(b,c,d,e){for(var f=b._images,g=a._workingCanvas,h=a._workingContext,i=f.length/c,j=0;i>j;j++){var k=f[j];k.__tmp=j,h.setTransform(1,0,0,1,0,0),h.clearRect(0,0,g.width+1,g.height+1),g.width=k.width,g.height=k.height,h.setTransform(d?-1:1,0,0,e?-1:1,d?k.width:0,e?k.height:0),h.drawImage(k,0,0);var l=document.createElement("img");l.src=g.toDataURL("image/png"),l.width=k.width,l.height=k.height,f.push(l)}var m=b._frames,n=m.length/c;for(j=0;n>j;j++){k=m[j];var o=k.rect.clone();l=f[k.image.__tmp+i*c];var p={image:l,rect:o,regX:k.regX,regY:k.regY};d&&(o.x=l.width-o.x-o.width,p.regX=o.width-k.regX),e&&(o.y=l.height-o.y-o.height,p.regY=o.height-k.regY),m.push(p)}var q="_"+(d?"h":"")+(e?"v":""),r=b._animations,s=b._data,t=r.length/c;for(j=0;t>j;j++){var u=r[j];k=s[u];var v={name:u+q,speed:k.speed,next:k.next,frames:[]};k.next&&(v.next+=q),m=k.frames;for(var w=0,x=m.length;x>w;w++)v.frames.push(m[w]+n*c);s[v.name]=v,r.push(v.name)}},createjs.SpriteSheetUtils=a}(),this.createjs=this.createjs||{},function(){function a(){this.EventDispatcher_constructor(),this.maxWidth=2048,this.maxHeight=2048,this.spriteSheet=null,this.scale=1,this.padding=1,this.timeSlice=.3,this.progress=-1,this._frames=[],this._animations={},this._data=null,this._nextFrameIndex=0,this._index=0,this._timerID=null,this._scale=1
}var b=createjs.extend(a,createjs.EventDispatcher);a.ERR_DIMENSIONS="frame dimensions exceed max spritesheet dimensions",a.ERR_RUNNING="a build is already running",b.addFrame=function(b,c,d,e,f){if(this._data)throw a.ERR_RUNNING;var g=c||b.bounds||b.nominalBounds;return!g&&b.getBounds&&(g=b.getBounds()),g?(d=d||1,this._frames.push({source:b,sourceRect:g,scale:d,funct:e,data:f,index:this._frames.length,height:g.height*d})-1):null},b.addAnimation=function(b,c,d,e){if(this._data)throw a.ERR_RUNNING;this._animations[b]={frames:c,next:d,frequency:e}},b.addMovieClip=function(b,c,d,e,f,g){if(this._data)throw a.ERR_RUNNING;var h=b.frameBounds,i=c||b.bounds||b.nominalBounds;if(!i&&b.getBounds&&(i=b.getBounds()),i||h){var j,k,l=this._frames.length,m=b.timeline.duration;for(j=0;m>j;j++){var n=h&&h[j]?h[j]:i;this.addFrame(b,n,d,this._setupMovieClipFrame,{i:j,f:e,d:f})}var o=b.timeline._labels,p=[];for(var q in o)p.push({index:o[q],label:q});if(p.length)for(p.sort(function(a,b){return a.index-b.index}),j=0,k=p.length;k>j;j++){for(var r=p[j].label,s=l+p[j].index,t=l+(j==k-1?m:p[j+1].index),u=[],v=s;t>v;v++)u.push(v);(!g||(r=g(r,b,s,t)))&&this.addAnimation(r,u,!0)}}},b.build=function(){if(this._data)throw a.ERR_RUNNING;for(this._startBuild();this._drawNext(););return this._endBuild(),this.spriteSheet},b.buildAsync=function(b){if(this._data)throw a.ERR_RUNNING;this.timeSlice=b,this._startBuild();var c=this;this._timerID=setTimeout(function(){c._run()},50-50*Math.max(.01,Math.min(.99,this.timeSlice||.3)))},b.stopAsync=function(){clearTimeout(this._timerID),this._data=null},b.clone=function(){throw"SpriteSheetBuilder cannot be cloned."},b.toString=function(){return"[SpriteSheetBuilder]"},b._startBuild=function(){var b=this.padding||0;this.progress=0,this.spriteSheet=null,this._index=0,this._scale=this.scale;var c=[];this._data={images:[],frames:c,animations:this._animations};var d=this._frames.slice();if(d.sort(function(a,b){return a.height<=b.height?-1:1}),d[d.length-1].height+2*b>this.maxHeight)throw a.ERR_DIMENSIONS;for(var e=0,f=0,g=0;d.length;){var h=this._fillRow(d,e,g,c,b);if(h.w>f&&(f=h.w),e+=h.h,!h.h||!d.length){var i=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas");i.width=this._getSize(f,this.maxWidth),i.height=this._getSize(e,this.maxHeight),this._data.images[g]=i,h.h||(f=e=0,g++)}}},b._setupMovieClipFrame=function(a,b){var c=a.actionsEnabled;a.actionsEnabled=!1,a.gotoAndStop(b.i),a.actionsEnabled=c,b.f&&b.f(a,b.d,b.i)},b._getSize=function(a,b){for(var c=4;Math.pow(2,++c)<a;);return Math.min(b,Math.pow(2,c))},b._fillRow=function(b,c,d,e,f){var g=this.maxWidth,h=this.maxHeight;c+=f;for(var i=h-c,j=f,k=0,l=b.length-1;l>=0;l--){var m=b[l],n=this._scale*m.scale,o=m.sourceRect,p=m.source,q=Math.floor(n*o.x-f),r=Math.floor(n*o.y-f),s=Math.ceil(n*o.height+2*f),t=Math.ceil(n*o.width+2*f);if(t>g)throw a.ERR_DIMENSIONS;s>i||j+t>g||(m.img=d,m.rect=new createjs.Rectangle(j,c,t,s),k=k||s,b.splice(l,1),e[m.index]=[j,c,t,s,d,Math.round(-q+n*p.regX-f),Math.round(-r+n*p.regY-f)],j+=t)}return{w:j,h:k}},b._endBuild=function(){this.spriteSheet=new createjs.SpriteSheet(this._data),this._data=null,this.progress=1,this.dispatchEvent("complete")},b._run=function(){for(var a=50*Math.max(.01,Math.min(.99,this.timeSlice||.3)),b=(new Date).getTime()+a,c=!1;b>(new Date).getTime();)if(!this._drawNext()){c=!0;break}if(c)this._endBuild();else{var d=this;this._timerID=setTimeout(function(){d._run()},50-a)}var e=this.progress=this._index/this._frames.length;if(this.hasEventListener("progress")){var f=new createjs.Event("progress");f.progress=e,this.dispatchEvent(f)}},b._drawNext=function(){var a=this._frames[this._index],b=a.scale*this._scale,c=a.rect,d=a.sourceRect,e=this._data.images[a.img],f=e.getContext("2d");return a.funct&&a.funct(a.source,a.data),f.save(),f.beginPath(),f.rect(c.x,c.y,c.width,c.height),f.clip(),f.translate(Math.ceil(c.x-d.x*b),Math.ceil(c.y-d.y*b)),f.scale(b,b),a.source.draw(f),f.restore(),++this._index<this._frames.length},createjs.SpriteSheetBuilder=createjs.promote(a,"EventDispatcher")}(),this.createjs=this.createjs||{},function(){function a(a){this.DisplayObject_constructor(),"string"==typeof a&&(a=document.getElementById(a)),this.mouseEnabled=!1;var b=a.style;b.position="absolute",b.transformOrigin=b.WebkitTransformOrigin=b.msTransformOrigin=b.MozTransformOrigin=b.OTransformOrigin="0% 0%",this.htmlElement=a,this._oldProps=null}var b=createjs.extend(a,createjs.DisplayObject);b.isVisible=function(){return null!=this.htmlElement},b.draw=function(){return!0},b.cache=function(){},b.uncache=function(){},b.updateCache=function(){},b.hitTest=function(){},b.localToGlobal=function(){},b.globalToLocal=function(){},b.localToLocal=function(){},b.clone=function(){throw"DOMElement cannot be cloned."},b.toString=function(){return"[DOMElement (name="+this.name+")]"},b._tick=function(a){var b=this.getStage();b&&b.on("drawend",this._handleDrawEnd,this,!0),this.DisplayObject__tick(a)},b._handleDrawEnd=function(){var a=this.htmlElement;if(a){var b=a.style,c=this.getConcatenatedDisplayProps(this._props),d=c.matrix,e=c.visible?"visible":"hidden";if(e!=b.visibility&&(b.visibility=e),c.visible){var f=this._oldProps,g=f&&f.matrix,h=1e4;if(!g||!g.equals(d)){var i="matrix("+(d.a*h|0)/h+","+(d.b*h|0)/h+","+(d.c*h|0)/h+","+(d.d*h|0)/h+","+(d.tx+.5|0);b.transform=b.WebkitTransform=b.OTransform=b.msTransform=i+","+(d.ty+.5|0)+")",b.MozTransform=i+"px,"+(d.ty+.5|0)+"px)",f||(f=this._oldProps=new createjs.DisplayProps(!0,0/0)),f.matrix.copy(d)}f.alpha!=c.alpha&&(b.opacity=""+(c.alpha*h|0)/h,f.alpha=c.alpha)}}},createjs.DOMElement=createjs.promote(a,"DisplayObject")}(),this.createjs=this.createjs||{},function(){function a(){}var b=a.prototype;b.getBounds=function(a){return a},b.applyFilter=function(a,b,c,d,e,f,g,h){f=f||a,null==g&&(g=b),null==h&&(h=c);try{var i=a.getImageData(b,c,d,e)}catch(j){return!1}return this._applyFilter(i)?(f.putImageData(i,g,h),!0):!1},b.toString=function(){return"[Filter]"},b.clone=function(){return new a},b._applyFilter=function(){return!0},createjs.Filter=a}(),this.createjs=this.createjs||{},function(){function a(a,b,c){(isNaN(a)||0>a)&&(a=0),(isNaN(b)||0>b)&&(b=0),(isNaN(c)||1>c)&&(c=1),this.blurX=0|a,this.blurY=0|b,this.quality=0|c}var b=createjs.extend(a,createjs.Filter);a.MUL_TABLE=[1,171,205,293,57,373,79,137,241,27,391,357,41,19,283,265,497,469,443,421,25,191,365,349,335,161,155,149,9,278,269,261,505,245,475,231,449,437,213,415,405,395,193,377,369,361,353,345,169,331,325,319,313,307,301,37,145,285,281,69,271,267,263,259,509,501,493,243,479,118,465,459,113,446,55,435,429,423,209,413,51,403,199,393,97,3,379,375,371,367,363,359,355,351,347,43,85,337,333,165,327,323,5,317,157,311,77,305,303,75,297,294,73,289,287,71,141,279,277,275,68,135,67,133,33,262,260,129,511,507,503,499,495,491,61,121,481,477,237,235,467,232,115,457,227,451,7,445,221,439,218,433,215,427,425,211,419,417,207,411,409,203,202,401,399,396,197,49,389,387,385,383,95,189,47,187,93,185,23,183,91,181,45,179,89,177,11,175,87,173,345,343,341,339,337,21,167,83,331,329,327,163,81,323,321,319,159,79,315,313,39,155,309,307,153,305,303,151,75,299,149,37,295,147,73,291,145,289,287,143,285,71,141,281,35,279,139,69,275,137,273,17,271,135,269,267,133,265,33,263,131,261,130,259,129,257,1],a.SHG_TABLE=[0,9,10,11,9,12,10,11,12,9,13,13,10,9,13,13,14,14,14,14,10,13,14,14,14,13,13,13,9,14,14,14,15,14,15,14,15,15,14,15,15,15,14,15,15,15,15,15,14,15,15,15,15,15,15,12,14,15,15,13,15,15,15,15,16,16,16,15,16,14,16,16,14,16,13,16,16,16,15,16,13,16,15,16,14,9,16,16,16,16,16,16,16,16,16,13,14,16,16,15,16,16,10,16,15,16,14,16,16,14,16,16,14,16,16,14,15,16,16,16,14,15,14,15,13,16,16,15,17,17,17,17,17,17,14,15,17,17,16,16,17,16,15,17,16,17,11,17,16,17,16,17,16,17,17,16,17,17,16,17,17,16,16,17,17,17,16,14,17,17,17,17,15,16,14,16,15,16,13,16,15,16,14,16,15,16,12,16,15,16,17,17,17,17,17,13,16,15,17,17,17,16,15,17,17,17,16,15,17,17,14,16,17,17,16,17,17,16,15,17,16,14,17,16,15,17,16,17,17,16,17,15,16,17,14,17,16,15,17,16,17,13,17,16,17,17,16,17,14,17,16,17,16,17,16,17,9],b.getBounds=function(a){var b=0|this.blurX,c=0|this.blurY;if(0>=b&&0>=c)return a;var d=Math.pow(this.quality,.2);return(a||new createjs.Rectangle).pad(b*d+1,c*d+1,b*d+1,c*d+1)},b.clone=function(){return new a(this.blurX,this.blurY,this.quality)},b.toString=function(){return"[BlurFilter]"},b._applyFilter=function(b){var c=this.blurX>>1;if(isNaN(c)||0>c)return!1;var d=this.blurY>>1;if(isNaN(d)||0>d)return!1;if(0==c&&0==d)return!1;var e=this.quality;(isNaN(e)||1>e)&&(e=1),e|=0,e>3&&(e=3),1>e&&(e=1);var f=b.data,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=c+c+1|0,w=d+d+1|0,x=0|b.width,y=0|b.height,z=x-1|0,A=y-1|0,B=c+1|0,C=d+1|0,D={r:0,b:0,g:0,a:0},E=D;for(i=1;v>i;i++)E=E.n={r:0,b:0,g:0,a:0};E.n=D;var F={r:0,b:0,g:0,a:0},G=F;for(i=1;w>i;i++)G=G.n={r:0,b:0,g:0,a:0};G.n=F;for(var H=null,I=0|a.MUL_TABLE[c],J=0|a.SHG_TABLE[c],K=0|a.MUL_TABLE[d],L=0|a.SHG_TABLE[d];e-->0;){m=l=0;var M=I,N=J;for(h=y;--h>-1;){for(n=B*(r=f[0|l]),o=B*(s=f[l+1|0]),p=B*(t=f[l+2|0]),q=B*(u=f[l+3|0]),E=D,i=B;--i>-1;)E.r=r,E.g=s,E.b=t,E.a=u,E=E.n;for(i=1;B>i;i++)j=l+((i>z?z:i)<<2)|0,n+=E.r=f[j],o+=E.g=f[j+1],p+=E.b=f[j+2],q+=E.a=f[j+3],E=E.n;for(H=D,g=0;x>g;g++)f[l++]=n*M>>>N,f[l++]=o*M>>>N,f[l++]=p*M>>>N,f[l++]=q*M>>>N,j=m+((j=g+c+1)<z?j:z)<<2,n-=H.r-(H.r=f[j]),o-=H.g-(H.g=f[j+1]),p-=H.b-(H.b=f[j+2]),q-=H.a-(H.a=f[j+3]),H=H.n;m+=x}for(M=K,N=L,g=0;x>g;g++){for(l=g<<2|0,n=C*(r=f[l])|0,o=C*(s=f[l+1|0])|0,p=C*(t=f[l+2|0])|0,q=C*(u=f[l+3|0])|0,G=F,i=0;C>i;i++)G.r=r,G.g=s,G.b=t,G.a=u,G=G.n;for(k=x,i=1;d>=i;i++)l=k+g<<2,n+=G.r=f[l],o+=G.g=f[l+1],p+=G.b=f[l+2],q+=G.a=f[l+3],G=G.n,A>i&&(k+=x);if(l=g,H=F,e>0)for(h=0;y>h;h++)j=l<<2,f[j+3]=u=q*M>>>N,u>0?(f[j]=n*M>>>N,f[j+1]=o*M>>>N,f[j+2]=p*M>>>N):f[j]=f[j+1]=f[j+2]=0,j=g+((j=h+C)<A?j:A)*x<<2,n-=H.r-(H.r=f[j]),o-=H.g-(H.g=f[j+1]),p-=H.b-(H.b=f[j+2]),q-=H.a-(H.a=f[j+3]),H=H.n,l+=x;else for(h=0;y>h;h++)j=l<<2,f[j+3]=u=q*M>>>N,u>0?(u=255/u,f[j]=(n*M>>>N)*u,f[j+1]=(o*M>>>N)*u,f[j+2]=(p*M>>>N)*u):f[j]=f[j+1]=f[j+2]=0,j=g+((j=h+C)<A?j:A)*x<<2,n-=H.r-(H.r=f[j]),o-=H.g-(H.g=f[j+1]),p-=H.b-(H.b=f[j+2]),q-=H.a-(H.a=f[j+3]),H=H.n,l+=x}}return!0},createjs.BlurFilter=createjs.promote(a,"Filter")}(),this.createjs=this.createjs||{},function(){function a(a){this.alphaMap=a,this._alphaMap=null,this._mapData=null}var b=createjs.extend(a,createjs.Filter);b.clone=function(){var b=new a(this.alphaMap);return b._alphaMap=this._alphaMap,b._mapData=this._mapData,b},b.toString=function(){return"[AlphaMapFilter]"},b._applyFilter=function(a){if(!this.alphaMap)return!0;if(!this._prepAlphaMap())return!1;for(var b=a.data,c=this._mapData,d=0,e=b.length;e>d;d+=4)b[d+3]=c[d]||0;return!0},b._prepAlphaMap=function(){if(!this.alphaMap)return!1;if(this.alphaMap==this._alphaMap&&this._mapData)return!0;this._mapData=null;var a,b=this._alphaMap=this.alphaMap,c=b;b instanceof HTMLCanvasElement?a=c.getContext("2d"):(c=createjs.createCanvas?createjs.createCanvas():document.createElement("canvas"),c.width=b.width,c.height=b.height,a=c.getContext("2d"),a.drawImage(b,0,0));try{var d=a.getImageData(0,0,b.width,b.height)}catch(e){return!1}return this._mapData=d.data,!0},createjs.AlphaMapFilter=createjs.promote(a,"Filter")}(),this.createjs=this.createjs||{},function(){function a(a){this.mask=a}var b=createjs.extend(a,createjs.Filter);b.applyFilter=function(a,b,c,d,e,f,g,h){return this.mask?(f=f||a,null==g&&(g=b),null==h&&(h=c),f.save(),a!=f?!1:(f.globalCompositeOperation="destination-in",f.drawImage(this.mask,g,h),f.restore(),!0)):!0},b.clone=function(){return new a(this.mask)},b.toString=function(){return"[AlphaMaskFilter]"},createjs.AlphaMaskFilter=createjs.promote(a,"Filter")}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d,e,f,g,h){this.redMultiplier=null!=a?a:1,this.greenMultiplier=null!=b?b:1,this.blueMultiplier=null!=c?c:1,this.alphaMultiplier=null!=d?d:1,this.redOffset=e||0,this.greenOffset=f||0,this.blueOffset=g||0,this.alphaOffset=h||0}var b=createjs.extend(a,createjs.Filter);b.toString=function(){return"[ColorFilter]"},b.clone=function(){return new a(this.redMultiplier,this.greenMultiplier,this.blueMultiplier,this.alphaMultiplier,this.redOffset,this.greenOffset,this.blueOffset,this.alphaOffset)},b._applyFilter=function(a){for(var b=a.data,c=b.length,d=0;c>d;d+=4)b[d]=b[d]*this.redMultiplier+this.redOffset,b[d+1]=b[d+1]*this.greenMultiplier+this.greenOffset,b[d+2]=b[d+2]*this.blueMultiplier+this.blueOffset,b[d+3]=b[d+3]*this.alphaMultiplier+this.alphaOffset;return!0},createjs.ColorFilter=createjs.promote(a,"Filter")}(),this.createjs=this.createjs||{},function(){function a(a,b,c,d){this.setColor(a,b,c,d)}var b=a.prototype;a.DELTA_INDEX=[0,.01,.02,.04,.05,.06,.07,.08,.1,.11,.12,.14,.15,.16,.17,.18,.2,.21,.22,.24,.25,.27,.28,.3,.32,.34,.36,.38,.4,.42,.44,.46,.48,.5,.53,.56,.59,.62,.65,.68,.71,.74,.77,.8,.83,.86,.89,.92,.95,.98,1,1.06,1.12,1.18,1.24,1.3,1.36,1.42,1.48,1.54,1.6,1.66,1.72,1.78,1.84,1.9,1.96,2,2.12,2.25,2.37,2.5,2.62,2.75,2.87,3,3.2,3.4,3.6,3.8,4,4.3,4.7,4.9,5,5.5,6,6.5,6.8,7,7.3,7.5,7.8,8,8.4,8.7,9,9.4,9.6,9.8,10],a.IDENTITY_MATRIX=[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1],a.LENGTH=a.IDENTITY_MATRIX.length,b.setColor=function(a,b,c,d){return this.reset().adjustColor(a,b,c,d)},b.reset=function(){return this.copy(a.IDENTITY_MATRIX)},b.adjustColor=function(a,b,c,d){return this.adjustHue(d),this.adjustContrast(b),this.adjustBrightness(a),this.adjustSaturation(c)},b.adjustBrightness=function(a){return 0==a||isNaN(a)?this:(a=this._cleanValue(a,255),this._multiplyMatrix([1,0,0,0,a,0,1,0,0,a,0,0,1,0,a,0,0,0,1,0,0,0,0,0,1]),this)},b.adjustContrast=function(b){if(0==b||isNaN(b))return this;b=this._cleanValue(b,100);var c;return 0>b?c=127+b/100*127:(c=b%1,c=0==c?a.DELTA_INDEX[b]:a.DELTA_INDEX[b<<0]*(1-c)+a.DELTA_INDEX[(b<<0)+1]*c,c=127*c+127),this._multiplyMatrix([c/127,0,0,0,.5*(127-c),0,c/127,0,0,.5*(127-c),0,0,c/127,0,.5*(127-c),0,0,0,1,0,0,0,0,0,1]),this},b.adjustSaturation=function(a){if(0==a||isNaN(a))return this;a=this._cleanValue(a,100);var b=1+(a>0?3*a/100:a/100),c=.3086,d=.6094,e=.082;return this._multiplyMatrix([c*(1-b)+b,d*(1-b),e*(1-b),0,0,c*(1-b),d*(1-b)+b,e*(1-b),0,0,c*(1-b),d*(1-b),e*(1-b)+b,0,0,0,0,0,1,0,0,0,0,0,1]),this},b.adjustHue=function(a){if(0==a||isNaN(a))return this;a=this._cleanValue(a,180)/180*Math.PI;var b=Math.cos(a),c=Math.sin(a),d=.213,e=.715,f=.072;return this._multiplyMatrix([d+b*(1-d)+c*-d,e+b*-e+c*-e,f+b*-f+c*(1-f),0,0,d+b*-d+.143*c,e+b*(1-e)+.14*c,f+b*-f+c*-.283,0,0,d+b*-d+c*-(1-d),e+b*-e+c*e,f+b*(1-f)+c*f,0,0,0,0,0,1,0,0,0,0,0,1]),this},b.concat=function(b){return b=this._fixMatrix(b),b.length!=a.LENGTH?this:(this._multiplyMatrix(b),this)},b.clone=function(){return(new a).copy(this)},b.toArray=function(){for(var b=[],c=0,d=a.LENGTH;d>c;c++)b[c]=this[c];return b},b.copy=function(b){for(var c=a.LENGTH,d=0;c>d;d++)this[d]=b[d];return this},b.toString=function(){return"[ColorMatrix]"},b._multiplyMatrix=function(a){var b,c,d,e=[];for(b=0;5>b;b++){for(c=0;5>c;c++)e[c]=this[c+5*b];for(c=0;5>c;c++){var f=0;for(d=0;5>d;d++)f+=a[c+5*d]*e[d];this[c+5*b]=f}}},b._cleanValue=function(a,b){return Math.min(b,Math.max(-b,a))},b._fixMatrix=function(b){return b instanceof a&&(b=b.toArray()),b.length<a.LENGTH?b=b.slice(0,b.length).concat(a.IDENTITY_MATRIX.slice(b.length,a.LENGTH)):b.length>a.LENGTH&&(b=b.slice(0,a.LENGTH)),b},createjs.ColorMatrix=a}(),this.createjs=this.createjs||{},function(){function a(a){this.matrix=a}var b=createjs.extend(a,createjs.Filter);b.toString=function(){return"[ColorMatrixFilter]"},b.clone=function(){return new a(this.matrix)},b._applyFilter=function(a){for(var b,c,d,e,f=a.data,g=f.length,h=this.matrix,i=h[0],j=h[1],k=h[2],l=h[3],m=h[4],n=h[5],o=h[6],p=h[7],q=h[8],r=h[9],s=h[10],t=h[11],u=h[12],v=h[13],w=h[14],x=h[15],y=h[16],z=h[17],A=h[18],B=h[19],C=0;g>C;C+=4)b=f[C],c=f[C+1],d=f[C+2],e=f[C+3],f[C]=b*i+c*j+d*k+e*l+m,f[C+1]=b*n+c*o+d*p+e*q+r,f[C+2]=b*s+c*t+d*u+e*v+w,f[C+3]=b*x+c*y+d*z+e*A+B;return!0},createjs.ColorMatrixFilter=createjs.promote(a,"Filter")}(),this.createjs=this.createjs||{},function(){function a(){throw"Touch cannot be instantiated"}a.isSupported=function(){return!!("ontouchstart"in window||window.navigator.msPointerEnabled&&window.navigator.msMaxTouchPoints>0||window.navigator.pointerEnabled&&window.navigator.maxTouchPoints>0)},a.enable=function(b,c,d){return b&&b.canvas&&a.isSupported()?b.__touch?!0:(b.__touch={pointers:{},multitouch:!c,preventDefault:!d,count:0},"ontouchstart"in window?a._IOS_enable(b):(window.navigator.msPointerEnabled||window.navigator.pointerEnabled)&&a._IE_enable(b),!0):!1},a.disable=function(b){b&&("ontouchstart"in window?a._IOS_disable(b):(window.navigator.msPointerEnabled||window.navigator.pointerEnabled)&&a._IE_disable(b),delete b.__touch)},a._IOS_enable=function(b){var c=b.canvas,d=b.__touch.f=function(c){a._IOS_handleEvent(b,c)};c.addEventListener("touchstart",d,!1),c.addEventListener("touchmove",d,!1),c.addEventListener("touchend",d,!1),c.addEventListener("touchcancel",d,!1)},a._IOS_disable=function(a){var b=a.canvas;if(b){var c=a.__touch.f;b.removeEventListener("touchstart",c,!1),b.removeEventListener("touchmove",c,!1),b.removeEventListener("touchend",c,!1),b.removeEventListener("touchcancel",c,!1)}},a._IOS_handleEvent=function(a,b){if(a){a.__touch.preventDefault&&b.preventDefault&&b.preventDefault();for(var c=b.changedTouches,d=b.type,e=0,f=c.length;f>e;e++){var g=c[e],h=g.identifier;g.target==a.canvas&&("touchstart"==d?this._handleStart(a,h,b,g.pageX,g.pageY):"touchmove"==d?this._handleMove(a,h,b,g.pageX,g.pageY):("touchend"==d||"touchcancel"==d)&&this._handleEnd(a,h,b))}}},a._IE_enable=function(b){var c=b.canvas,d=b.__touch.f=function(c){a._IE_handleEvent(b,c)};void 0===window.navigator.pointerEnabled?(c.addEventListener("MSPointerDown",d,!1),window.addEventListener("MSPointerMove",d,!1),window.addEventListener("MSPointerUp",d,!1),window.addEventListener("MSPointerCancel",d,!1),b.__touch.preventDefault&&(c.style.msTouchAction="none")):(c.addEventListener("pointerdown",d,!1),window.addEventListener("pointermove",d,!1),window.addEventListener("pointerup",d,!1),window.addEventListener("pointercancel",d,!1),b.__touch.preventDefault&&(c.style.touchAction="none")),b.__touch.activeIDs={}},a._IE_disable=function(a){var b=a.__touch.f;void 0===window.navigator.pointerEnabled?(window.removeEventListener("MSPointerMove",b,!1),window.removeEventListener("MSPointerUp",b,!1),window.removeEventListener("MSPointerCancel",b,!1),a.canvas&&a.canvas.removeEventListener("MSPointerDown",b,!1)):(window.removeEventListener("pointermove",b,!1),window.removeEventListener("pointerup",b,!1),window.removeEventListener("pointercancel",b,!1),a.canvas&&a.canvas.removeEventListener("pointerdown",b,!1))},a._IE_handleEvent=function(a,b){if(a){a.__touch.preventDefault&&b.preventDefault&&b.preventDefault();var c=b.type,d=b.pointerId,e=a.__touch.activeIDs;if("MSPointerDown"==c||"pointerdown"==c){if(b.srcElement!=a.canvas)return;e[d]=!0,this._handleStart(a,d,b,b.pageX,b.pageY)}else e[d]&&("MSPointerMove"==c||"pointermove"==c?this._handleMove(a,d,b,b.pageX,b.pageY):("MSPointerUp"==c||"MSPointerCancel"==c||"pointerup"==c||"pointercancel"==c)&&(delete e[d],this._handleEnd(a,d,b)))}},a._handleStart=function(a,b,c,d,e){var f=a.__touch;if(f.multitouch||!f.count){var g=f.pointers;g[b]||(g[b]=!0,f.count++,a._handlePointerDown(b,c,d,e))}},a._handleMove=function(a,b,c,d,e){a.__touch.pointers[b]&&a._handlePointerMove(b,c,d,e)},a._handleEnd=function(a,b,c){var d=a.__touch,e=d.pointers;e[b]&&(d.count--,a._handlePointerUp(b,c,!0),delete e[b])},createjs.Touch=a}(),this.createjs=this.createjs||{},function(){var a=createjs.EaselJS=createjs.EaselJS||{};a.version="0.8.0",a.buildDate="Thu, 11 Dec 2014 23:32:09 GMT"}();
define("easel", function(){});

/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery'       : 'lib/jquery',
    'jquery.easing': 'lib/jquery.easing',
    'box2d'        : 'lib/Box2dWeb',
    'easel'        : 'lib/easeljs.min',
    'mod'          : 'mod'
  },
  "shim": {
    "jquery.easing": ["jquery"]
  }
});

require([
  'mod/nav/anchor',
  'mod/screen',
  'mod/browser',
  'mod/utils/raf',
  'app/b2',
  'box2d',
  'easel'
], function(Anchor, Screen, Browser, raf, b2) {
  $(function() {
    console.log('DOM ready.');
    var CANVAS_WIDTH = 600;
    var CANVAS_HEIGHT = 400;
    var SCALE = 30;

    var world = new b2.World(new b2.Vec2(0, 10), true);

    // floor settings
    var fixDef = new b2.FixtureDef();
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2;

    var bodyDef = new b2.BodyDef();
    bodyDef.type = b2.Body.b2_staticBody;
    // positions the center of the object (not upper left!)
    bodyDef.position.x = CANVAS_WIDTH / 2 / SCALE;
    bodyDef.position.y = CANVAS_HEIGHT / 1 / SCALE;

    fixDef.shape = new b2.PolygonShape();
    // half width, half height.
    fixDef.shape.SetAsBox(CANVAS_WIDTH / 2 / SCALE, 10 / 2 / SCALE);

    var body = world.CreateBody(bodyDef);
    body.CreateFixture(fixDef);

    // fix ball settings
    var b1fixDef = new b2.FixtureDef();
    b1fixDef.density = 1.0;
    b1fixDef.friction = 0.5;
    b1fixDef.restitution = 0.2;

    var b1bodyDef = new b2.BodyDef();
    b1bodyDef.type = b2.Body.b2_staticBody;
    // positions the center of the object (not upper left!)
    b1bodyDef.position.x = Math.random() * CANVAS_WIDTH / SCALE;
    b1bodyDef.position.y = Math.random() * CANVAS_HEIGHT / SCALE;

    b1fixDef.shape = new b2.CircleShape(10 / SCALE);

    var b1body = world.CreateBody(b1bodyDef)
    b1body.CreateFixture(b1fixDef);

    // free ball settings
    var b2fixDef = new b2.FixtureDef();
    b2fixDef.density = 1.0;
    b2fixDef.friction = 0.5;
    b2fixDef.restitution = 0.2;

    var b2bodyDef = new b2.BodyDef();
    b2bodyDef.type = b2.Body.b2_dynamicBody;
    // positions the center of the object (not upper left!)
    b2bodyDef.position.x = Math.random() * CANVAS_WIDTH / SCALE;
    b2bodyDef.position.y = Math.random() * CANVAS_HEIGHT / SCALE;

    b2fixDef.shape = new b2.CircleShape(10 / SCALE);

    var b2body = world.CreateBody(b2bodyDef);
    b2body.CreateFixture(b2fixDef);

    var jointDef = new b2.DistanceJointDef();
    jointDef.bodyA = b1body;
    jointDef.bodyB = b2body;
    jointDef.length = 50 / SCALE;
    jointDef.frequencyHz = 5;
    jointDef.dampingRatio = 0.1;
    jointDef.anchorPoint = b1body.GetWorldCenter();

    var joint = world.CreateJoint(jointDef);

    // mouse joint
    var mJointDef;
    var mJoint = null;
    var mouseX, mouseY;
    var isMouseDown = false;
    var selectedBody;
    var mousePVec;
    
    function handleMouseMove(e) {
      //console.log(e.offsetX, e.offsetY);
      mouseX = e.offsetX / SCALE;
      mouseY = e.offsetY / SCALE;
    };

    function getBodyAtMouse() {
      //console.log(mouseX, mouseY);
      mousePVec = new b2.Vec2(mouseX, mouseY);
      var aabb = new b2.AABB();
      aabb.lowerBound.Set(mouseX - 0.001, mouseY - 0.001);
      aabb.upperBound.Set(mouseX + 0.001, mouseY + 0.001);
     
      // Query the world for overlapping shapes.

      selectedBody = null;
      world.QueryAABB(getBodyCB, aabb);
      return selectedBody;
    }

    function getBodyCB(fixture) {
      //console.log(fixture.GetBody().GetType() != b2.Body.b2_staticBody);
      if(fixture.GetBody().GetType() != b2.Body.b2_staticBody) {
        if(fixture.GetShape().TestPoint(fixture.GetBody().GetTransform(), mousePVec)) {
          selectedBody = fixture.GetBody();
          return false;
        }
      }
      return true;
    }

    function onMouseDown(e) {
      console.log('start drag');
      isMouseDown = true;
      handleMouseMove(e);
      $debug.on('mousemove', onMouseMove);
    }
    function onMouseMove(e) {
      console.log('dragging');
      handleMouseMove(e);
    }
    function onMouseUp(e) {
      console.log('stop drag');
      isMouseDown = false;
      $debug.off('mousemove', onMouseMove);
    }

    //setup debug draw
    var $debug = $('#debug');
    $debug.attr('width', CANVAS_WIDTH).attr('height', CANVAS_HEIGHT);
    var debugDraw = new b2.DebugDraw();
    debugDraw.SetSprite($debug.get(0).getContext("2d"));
    debugDraw.SetDrawScale(SCALE);
    debugDraw.SetFillAlpha(0.3);
    debugDraw.SetLineThickness(1.0);
    debugDraw.SetFlags(b2.DebugDraw.e_shapeBit | b2.DebugDraw.e_jointBit);
    world.SetDebugDraw(debugDraw);
    
    // exec ticker
    var fps = 1 / 60;
    var steps = 100;
    var count = 0;
    var listner;
    var pos;
    
    listner = Ticker.on('tick', function(e) {
      if(isMouseDown && (!mJoint)) {
        var body = getBodyAtMouse();
        if(body) {
          mJointDef = new b2.MouseJointDef();
          mJointDef.bodyA = world.GetGroundBody();
          mJointDef.bodyB = body;
          mJointDef.target.Set(mouseX, mouseY);
          mJointDef.maxForce = body.GetMass() * 1000;
          mJointDef.collideConnected = true;
          mJoint = world.CreateJoint(mJointDef);
          body.SetAwake(true);
        }
      }

      if(mJoint) {
         if(isMouseDown) {
            mJoint.SetTarget(mousePVec);
         } else {
            world.DestroyJoint(mJoint);
            mJoint = null;
         }
      }

      world.Step(e.delta / 1000, 10, 10);
      world.DrawDebugData();
      world.ClearForces();
    });

    $debug.on('mousedown', onMouseDown);
    $debug.on('mouseup', onMouseUp);
  });
});


define("main-test2", function(){});

}());
