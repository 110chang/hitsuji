/*
*
*   Fence
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'app/cnf',
  'matter'
], function(extend, cnf, M) {
  M = M || window.Matter;
  var abs = Math.abs;
  var pow = Math.pow;

  function Fence() {
    this.bodies = [];
  }
  extend(Fence.prototype, {
    bodies: null,

    create: function(engine) {
      var i, x, y, w, h;
      var body;
      var CW = cnf.CANVAS_WIDTH;
      var CH = cnf.CANVAS_HEIGHT;
      var SCALE = cnf.SCALE;

      for (i = 0; i < 4; i++) {
        x = CW * (1 - abs(1 - i) / 2) / SCALE;
        y = CH * (1 - abs(2 - i) / 2) / SCALE;
        w = pow(CW, (i + 1) % 2) + pow(20, i % 2) / SCALE;
        h = pow(CH, i % 2) + pow(20, (i + 1) % 2) / SCALE;

        body = M.Bodies.rectangle(x, y, w, h, {
          isStatic: true,
          render: {
            fillStyle: 'rgba(64, 64, 64, 1)',
            strokeStyle: 'rgba(255, 255, 255, 1)',
            lineWidth: 1
          }
        });

        this.bodies.push(body);
      }
      M.World.add(engine.world, this.bodies);
    },
    break: function() {
      //console.log(this.bodies);
      this.bodies.forEach(function(body) {
        M.Body.setStatic(body, false);
        //M.Body.resetForcesAll(body);
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
      });
    }
  });

  return Fence;
});
