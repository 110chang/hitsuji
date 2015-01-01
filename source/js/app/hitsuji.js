/*
*
*   Hitsuji
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
  var CW = cnf.CANVAS_WIDTH;
  var CH = cnf.CANVAS_HEIGHT;
  var SCALE = cnf.SCALE;
  var random = Math.random;
  var abs = Math.abs;
  var pow = Math.pow;
  var cos = Math.cos;
  var sin = Math.sin;
  var PI = Math.PI;

  function Hitsuji(R) {
    this.R = R || 40;
    this.center = { x: CW / 2, y: CH / 2 };
  }
  extend(Hitsuji.prototype, {
    R: 0,
    center: null,

    create: function(engine) {
      var hitsuji = M.Composite.create();
      var i = 0;
      var l = 6;
      var c;
      var R = this.R;
      var x = this.center.x;
      var y = this.center.y;
      var body, next;
      var core = this._createCircle(x, y, R / 2, './img/bodyTop.png');
      var force = { x: random() * 0.1 - 0.05, y: random() * 0.1 - 0.05 };

      M.Composite.add(hitsuji, core);
      
      for (; i < l; i++) {
        x = 300 + R * cos(PI / 3 * i);
        y = 200 + R * sin(PI / 3 * i);
        body = this._createCircle(x, y, R / 2, './img/bodyTop.png');
        M.Composite.add(hitsuji, body);
      }
      for (i = 0; i < l; i++) {
        body = hitsuji.bodies[i + 1];
        if (i < l - 1) {
          next = hitsuji.bodies[i + 2];
        } else {
          next = hitsuji.bodies[1];
        }
        if (i === 0) {
          body.render.sprite.texture = './img/head.png';
        } else if (i === 3) {
          body.render.sprite.texture = './img/tail.png';
        } else {
          body.render.sprite.texture = './img/bodyBottom.png';
        }
        c = this._createConstraint(body, next);
        M.Composite.add(hitsuji, c);
        c = this._createConstraint(body, core);
        M.Composite.add(hitsuji, c);
      }
      M.Body.applyForce(hitsuji.bodies[0], hitsuji.bodies[0].position, force);
      M.World.add(engine.world, [hitsuji]);
    },
    _createCircle: function(x, y, r, src) {
      return M.Bodies.circle(x, y, r, {
        friction: 0.8,
        inertia: Infinity,
        render: {
          sprite: {
            texture: src
          }
        }
      });
    },
    _createConstraint: function(A, B) {
      return M.Constraint.create({
        bodyA: A,
        bodyB: B,
        pointA: { x: 0, y: 0 },
        pointB: { x: 0, y: 0 },
        stiffness: 0.8,
        length: this.R,
        render: {
          visible: false
        }
      });
    }
  });

  return Hitsuji;
});
