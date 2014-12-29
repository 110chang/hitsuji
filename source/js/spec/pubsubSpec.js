/*
*
*   Spec/PubSub
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/pubsub'
], function(extend, inherit, PubSub) {
  describe("Test case: PubSub", function() {
    var pubsub, onEvent;

    function Event() {
      PubSub.call(this);
    }
    inherit(Event, PubSub);
    extend(Event.prototype, {
      wait: function() {
        setTimeout(function() {
          done();
        }, 500);
      }
    });

    beforeEach(function () {
      pubsub = new PubSub();
      event = new Event();
      onEvent = jasmine.createSpy('onEvent');
      onEvent2 = jasmine.createSpy('onEvent2');
    });

    it('can create instance', function() {
      expect(pubsub instanceof PubSub).toBeTruthy();
      expect(PubSub() instanceof PubSub).toBeTruthy();
    });

    it('can subscribe and publish topics', function() {
      event.subscribe('onEvent', onEvent);
      event.publish('onEvent');
      expect(onEvent).toHaveBeenCalled();
      event.subscribe('onEvent2', onEvent2);
      event.publish('onEvent');
      event.publish('onEvent2');
      expect(onEvent2).toHaveBeenCalled();
      expect(onEvent.calls.count()).toEqual(2);
    });

    it('can remove topics', function() {
      event.subscribe('onEvent', onEvent);
      event.subscribe('onEvent2', onEvent2);
      event.unsubscribe('onEvent', onEvent);
      event.publish('onEvent');
      event.publish('onEvent2');
      expect(onEvent).not.toHaveBeenCalled();
      expect(onEvent2).toHaveBeenCalled();
    });

  }); 
});