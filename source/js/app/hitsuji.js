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
  var random = M.Common.random;
  var abs = Math.abs;
  var pow = Math.pow;
  var cos = Math.cos;
  var sin = Math.sin;
  var PI = Math.PI;

  function Hitsuji(x, y) {
    x = x || cnf.CANVAS_WIDTH / 2;
    y = y || cnf.CANVAS_HEIGHT / 2;
    this.center = { x: x, y: y };
  }
  extend(Hitsuji.prototype, {
    R: 0,
    center: null,

    create: function(engine) {
      var hitsuji;
      var x = this.center.x;
      var y = this.center.y;
      var force = { x: random(-0.01, 0.01), y: random(-0.01, 0.01) };
      var i = 0, l;

      hitsuji = M.Composites.softBody(x, y, 4, 3, 0, 0, true, 20, {
        density: 0.001
      }, {
        render: {
          visible: false
        }
      });
      hitsuji.bodies.forEach(function(body, i) {
        if (i === 0) {
          body.render.sprite.texture = './img/legFL.png';
        } else if (i === 3) {
          body.render.sprite.texture = './img/legBL.png';
        } else if (i === 4) {
          body.render.sprite.texture = './img/head.png';
        } else if (i === 7) {
          body.render.sprite.texture = './img/tail.png';
        } else if (i === 8) {
          body.render.sprite.texture = './img/legFR.png';
        } else if (i === 11) {
          body.render.sprite.texture = './img/legBR.png';
        } else {
          body.render.sprite.texture = './img/bodyTop.png';
        }
      });
      M.Body.applyForce(hitsuji.bodies[0], hitsuji.bodies[0].position, force);
      M.World.add(engine.world, [hitsuji]);
      console.log(hitsuji.bodies[0]);
    }
  });

  return Hitsuji;
});
