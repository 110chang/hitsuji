/*
*
*   Spec/Timer
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/timer'
], function(extend, Timer) {
  describe("Test case: Timer", function() {
    var timer;

    beforeEach(function () {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    it('can create instance.', function() {
      timer = new Timer();
      expect(timer instanceof Timer).toBeTruthy();

      timer = Timer();
      expect(timer instanceof Timer).toBeTruthy();
      expect(timer.duration).toEqual(10000);
      expect(timer.repeat).toEqual(0);
      expect(timer.count).toEqual(-1);
    });

    it('can start timer.', function() {
      timer = new Timer();
      spyOn(timer, 'start').and.callThrough();
      expect(timer.start).not.toHaveBeenCalled();
      timer.start();
      expect(timer.start).toHaveBeenCalled();
    });

    it('can repeat timer.', function(done) {
      var count = 3;
      timer = new Timer(500, count);
      timer.subscribe(Timer.TIMER, function(e, data) {
        expect(data.count).toEqual(--count);
        done();
      });
      timer.start();
    });

    it('can repeat timer permanently.', function(done) {
      timer = new Timer(100, -1);
      timer.subscribe(Timer.TIMER_STOP, function(e, data) {
        expect(data.time).toBeDefined();
        expect(typeof data.time).toEqual('number');
        done();
      });
      timer.start();
      var another = new Timer(1000);
      another.subscribe(Timer.TIMER, function(e, data) {
        timer.stop();
      });
      another.start();
    });

    it('publish `on timer start` event.', function(done) {
      timer = new Timer(1000);
      timer.subscribe(Timer.TIMER_START, function(e, data) {
        expect(data.time).toBeDefined();
        expect(typeof data.time).toEqual('number');
        done();
      });
      timer.start();
    });

    it('publish `on timer` event.', function(done) {
      timer = new Timer(1000);
      timer.subscribe(Timer.TIMER, function(e, data) {
        expect(data.count).toBeDefined();
        expect(typeof data.count).toEqual('number');
        done();
      });
      timer.start();
    });

    it('publish `on timer stop` event.', function(done) {
      timer = new Timer(1000);
      timer.subscribe(Timer.TIMER_STOP, function(e, data) {
        expect(data.time).toBeDefined();
        expect(typeof data.time).toEqual('number');
        done();
      });
      timer.start();
    });

  });
});