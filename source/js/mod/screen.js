/*
*
*   Screen r3
*
*   @author Yuji Ito @110chang
*
*/

define([
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
