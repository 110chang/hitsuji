/*
*
*   Fence
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend'
], function(extend, b2, cnf) {
  var CW = cnf.CANVAS_WIDTH;
  var CH = cnf.CANVAS_HEIGHT;
  var SCALE = cnf.SCALE;
  var abs = Math.abs;
  var pow = Math.pow;

  function Fence() {
    this.bodies = [];
  }
  extend(Fence.prototype, {
    bodies: null,

    create: function(world) {
      var i, fixDef, bodyDef, body;

      for(i = 0; i < 4; i++) {
        fixDef = new b2.FixtureDef();
        fixDef.density = 1.0; //密度
        fixDef.friction = 0.5; //摩擦
        fixDef.restitution = 0.2; //弾性

        bodyDef = new b2.BodyDef();
        bodyDef.type = b2.Body.b2_staticBody;
        // positions the center of the object (not upper left!)
        bodyDef.position.x = CW * (1 - abs(1 - i) / 2) / SCALE;
        bodyDef.position.y = CH * (1 - abs(2 - i) / 2) / SCALE;

        fixDef.shape = new b2.PolygonShape();
        // half width, half height.
        fixDef.shape.SetAsBox(pow(CW, (i + 1) % 2) / SCALE, pow(CH, i % 2) / SCALE);

        body = world.CreateBody(bodyDef);
        body.CreateFixture(fixDef);

        this.bodies.push(body);
      }
    }
  });
});
