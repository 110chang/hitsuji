/*
*
*   Spec/PubSubGroup
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/pubsub',
  'mod/pubsubgroup'
], function(extend, inherit, PubSub, PubSubGroup) {
  describe("Test case: PubSubGroup", function() {
    var psgroup, e1, e2, e3;

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
      psgroup = new PubSubGroup();
      e1 = new Event();
      e2 = new Event();
      e3 = new Event();
      onComplete = jasmine.createSpy('onComplete');
    });

    it('can create instance', function() {
      expect(psgroup instanceof PubSubGroup).toBeTruthy();
      expect(PubSubGroup() instanceof PubSubGroup).toBeTruthy();
    });

    it('can subscribe and publish topics', function() {
      psgroup.add(e1, 'onEvent');
      psgroup.add(e2, 'onEvent');
      psgroup.add(e3, 'onEvent');
      psgroup.subscribe('onComplete', onComplete);
      e1.publish('onEvent');
      expect(onComplete).not.toHaveBeenCalled();
      e2.publish('onEvent');
      expect(onComplete).not.toHaveBeenCalled();
      e3.publish('onEvent');
      expect(onComplete).toHaveBeenCalled();
    });

  }); 
});