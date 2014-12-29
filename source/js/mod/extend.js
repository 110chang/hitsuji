/*
*
*   Extend r1
*
*   @author Yuji Ito @110chang
*
*/

define([], function() {
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
