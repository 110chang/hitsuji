/*
*
*   PubSubGroup r2
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/pubsub'
], function(extend, inherit, PubSub) {
  function PubSubGroup() {
    if (!(this instanceof PubSubGroup)) {
      return new PubSubGroup();
    }
    PubSub.call(this);
    this.count = 0;
  }
  inherit(PubSubGroup, PubSub);
  extend(PubSubGroup.prototype, {
    count: 0,
    add: function(publisher, topic) {
      if (!publisher.subscribe) {
        throw new Error('Publisher must be inherit PubSub.');
      }
      publisher.subscribe(topic, '_onPublish', this);
      this.count++;
    },
    _onPublish: function() {
      this.count--;
      
      if (this.count === 0) {
        this.publish(PubSubGroup.COMPLETE);
      }
    }
  });
  PubSubGroup.COMPLETE = 'onComplete';

  return PubSubGroup;
});
