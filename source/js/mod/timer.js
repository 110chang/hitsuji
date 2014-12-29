/*
*
*   Timer r2
*
*   @author Yuji Ito @110chang
*
*/

define([
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
