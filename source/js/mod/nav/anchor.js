/*
*
*   Nav.Anchor r1
*
*   @author Yuji Ito @110chang
*
*/

define([
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