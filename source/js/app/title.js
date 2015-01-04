/*
*
*   Title
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
  var CW, CH, SCALE;
  var abs = Math.abs;
  var pow = Math.pow;
  var shadeColor = M.Common.shadeColor;
  var random = M.Common.random;

  function Title() {
    CW = cnf.CANVAS_WIDTH;
    CH = cnf.CANVAS_HEIGHT;
    SCALE = cnf.SCALE;

    this.center = { x: CW / 2, y: CH / 2 };
  }
  extend(Title.prototype, {
    engine: null,
    composite: null,

    create: function(engine) {
      //M.World.add(engine.world, this._createStopper());
      var title = M.Composite.create();
      var text = this._createText('2015');
      text.forEach(function(comp) {
        M.Composite.add(title, comp);
      });
      M.World.add(engine.world, title);
      this.composite = title;
      this.engine = engine;
      return title;
    },
    break: function() {
      //console.log(this.composite.composites);
      var bodies = [];
      var engine = this.engine;
      this.composite.composites.forEach(function(comp) {
        M.Composite.allConstraints(comp).forEach(function(cnst) {
          M.Composite.removeConstraint(comp, cnst, true);
        });
        M.Composite.allBodies(comp).forEach(function(body) {
          bodies.push({
            pos: body.position,
            rad: body.circleRadius,
            force: body.force
          });
          M.Composite.removeBody(comp, body, true);
        });
      });
      bodies.forEach(function(data) {
        var body = M.Bodies.circle(data.pos.x, data.pos.y, data.rad, {
          restitution: 0.9,
          render: {
            fillStyle: '#FF6B6B',
            strokeStyle: shadeColor('#FF6B6B', -20),
            lineWidth: 0
          }
        });
        var forceMagnitude = 0.00001;// * body.mass;
        var force = {
          x: (forceMagnitude + random() * forceMagnitude) * M.Common.choose([1, -1]),
          y: -forceMagnitude + random() * -forceMagnitude
        };
        //console.log(data.force.y);
        //M.Body.applyForce(body, body.position, force);
        M.World.add(engine.world, body);
      });
    },
    _createStopper: function() {
      return M.Bodies.rectangle(CW / 2, CH / 2, CW, 10, {
        isStatic: true
      });
    },
    _createText: function(str) {
      var _self = this;
      return str.split('').map(function(char, i) {
        return _self['_createChar' + char]();
      });
    },
    _createChar5: function() {
      return this._createChar({
        x: CW / 2 + 60, y: CH / 2 - 100
      }, [
        0, 0, 3, 1,
        0, 1, 1, 2,
        1, 2, 2, 1,
        2, 3, 1, 2,
        0, 4, 2, 1
      ], [
        [6, 0, 7, 1],
        [5, 0, 7, 4],
        [6, 0, 7, 1],
        [4, 3, 6, 7]
      ]);
    },
    _createChar2: function() {
      return this._createChar({
        x: CW / 2 - 280, y: CH / 2 - 100
      }, [
        0, 0, 3, 1,
        2, 1, 1, 2,
        0, 2, 2, 1,
        0, 3, 1, 2,
        1, 4, 2, 1
      ], [
        [10, 0, 11, 1],
        [ 4, 3,  6, 7],
        [ 4, 0,  5, 1],
        [ 5, 0,  7, 4]
      ]);
    },
    _createChar0: function() {
      return this._createChar({
        x: CW / 2 - 140, y: CH / 2 - 100
      }, [
        0, 0, 2, 1,
        2, 0, 1, 4,
        1, 4, 2, 1,
        0, 1, 1, 4
      ], [
        [ 3,  0,  7,  2],
        [14,  2, 15,  3],
        [ 0, 13,  4, 15],
        [ 0,  4,  1,  5]
      ]);
    },
    _createChar1: function() {
      return this._createChar({
        x: CW / 2 - 0, y: CH / 2 - 100
      }, [
        0, 0, 1, 5
      ], []);
    },
    _createChar: function(pos, me, jo) {
      var i = 0, j = 0;
      var C = M.Composite.create();
      for (; i < me.length - 3; i += 4) {
        M.Composite.add(C, M.Composites.softBody(
          pos.x + 40 * me[i],
          pos.y + 40 * me[i + 1],
          me[i + 2] * 2,
          me[i + 3] * 2,
          0, 0, true, 10, {
            density: 0.0001,
            render: {
              fillStyle: '#FF6B6B',
              strokeStyle: shadeColor('#FF6B6B', -20),
              lineWidth: 0
            }
          }, {
            stiffness: 1,
            render: {
              visible: false
            }
          }
        ));
      }
      for (i = 1; i < jo.length + 1; i++) {
        var p1 = C.composites[i] || C.composites[0];
        var p0 = C.composites[i - 1];
        var joint = jo[i - 1];
        for (j = 0; j < joint.length - 1; j += 2) {
          M.Composite.add(C, [this._joint(
            p0.bodies[joint[j]],
            p1.bodies[joint[j + 1]]
          ), this._joint(
            p0.bodies[joint[j]],
            p1.bodies[joint[joint.length - 1 - j]]
          )]);
        }
      }
      return C;
    },
    _joint: function(A, B) {
      return M.Constraint.create({
        bodyA: A,
        bodyB: B,
        stiffness: 1,
        render: {
          visible: false
        },
        length: 20
      });
    }
  });

  return Title;
});
