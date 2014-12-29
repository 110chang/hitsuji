/*
*
*   Inherit r2
*
*   @author Yuji Ito @110chang
*
*/

define([], function() {
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
