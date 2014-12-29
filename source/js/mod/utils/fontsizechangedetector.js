/*
*
*   Utils.FontSizeChangeDetector r2
*
*   @author Yuji Ito @110chang
*
*/

define([
  'jquery',
  'mod/extend',
  'mod/inherit',
  'mod/pubsub',
  'mod/utils/timer'
], function($, extend, inherit, PubSub, Timer) {
  var _instance = null;
  var interval  = 66; // neary 1000 / 15
  var $div      = $('<div />');
  var str       = 'S';
  var target    = 0;
  var timer     = null;

  function FontSizeChangeDetector() {
    if (_instance != null) {
      return _instance;
    } else {
      if (!(this instanceof FontSizeChangeDetector)) {
        return new FontSizeChangeDetector();
      } else {
        _instance = this;
      }
    }
    PubSub.call(this);

    $div.text(str);
    $div.css({
      'visibility' : 'hidden',
      'position'   : 'absolute',
      'top'        : 0
    });
    $('body').append($div);
    target = $div.get(0).offsetHeight;
    
    timer = new Timer(interval);
    timer.subscribe(Timer.TIMER, $.proxy(this._onTimer, this));
    timer.start();
  }
  inherit(FontSizeChangeDetector, PubSub);
  
  FontSizeChangeDetector.FONT_SIZE_CHANGE = 'onFontSizeChange';

  extend(FontSizeChangeDetector.prototype, {
    _onTimer: function(e) {
      if (target !== $div.get(0).offsetHeight) {
        target = $div.get(0).offsetHeight;
        this.publish(FontSizeChangeDetector.FONT_SIZE_CHANGE);
      }
    }
  });
  
  return FontSizeChangeDetector;
});
