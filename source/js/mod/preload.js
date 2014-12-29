/*
*
*   Preload r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'jquery',
  'mod/extend',
  'mod/inherit',
  'mod/pubsub',
  'mod/browser',
  'mod/timer'
], function($, extend, inherit, PubSub, Browser, Timer) {
  var total, loaded, psuedo, print;
  var _instance = null;

  function Preload(qImgs) {
    if (_instance != null) {
      return _instance;
    } else {
      if (!(this instanceof Preload)) {
        return new Preload(qImgs);
      } else {
        _instance = this;
      }
    }
    PubSub.call(this);
    
    total = 0;
    loaded = 0;
    psuedo = 0;
    print = 0;
    qImgs = qImgs == null ? 'img' : qImgs;

    this.$imgs = $(qImgs);
    this.timer = new Timer(1000 / 60, -1);
    this.timer.subscribe(Timer.TIMER, $.proxy(this._onTimer, this));
  }
  inherit(Preload, PubSub);
  
  Preload.PRELOAD_INTERVAL = 'onPreloadInterval';
  Preload.PRELOAD_FINISH   = 'onPreloadFinish';

  extend(Preload.prototype, {
    $imgs: null,
    timer: null,
    
    exec: function() {
      this.$imgs.each(function(index) {
        if (!this.complete) {
          total++;
          
          if (Browser().IE()) {
            this.src = this.src + '?' + new Date().getTime();
          }
          $(this).on('load', function(e) {
            loaded++;
          });
        }
      });
      if (total === 0) {
        total = 1;
        loaded = 1;
      }
      this.timer.start();
    },
    _onTimer: function() {
      //console.log('Preload#onTimer');
      if (psuedo < loaded) {
        psuedo += (loaded - psuedo) * 0.1;
      }
      if (total > 0 && Math.abs(total - psuedo) < 0.1) {
        psuedo = total;
      }
      print = Math.round((psuedo / total) * 100) || 0;
      
      this.publish(Preload.PRELOAD_INTERVAL, { loaded : print });
      
      if (total > 0 && total === psuedo) {
        this.publish(Preload.PRELOAD_FINISH, { loaded : print });
        this.timer.stop();
      }
    }
  });
  
  return Preload;
});
