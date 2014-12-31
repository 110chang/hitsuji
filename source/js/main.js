/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery'       : 'lib/jquery',
    'jquery.easing': 'lib/jquery.easing',
    'matter'       : 'lib/matter-0.8.0.min',
    'mod'          : 'mod'
  },
  "shim": {
    "jquery.easing": [
      "jquery"
    ]
  }
});

require([
  'mod/nav/anchor',
  'mod/screen',
  'mod/utils/raf',
  'app/cnf',
  'app/fence',
  'matter'
], function(Anchor, Screen, raf, cnf, Fence, M) {
  $(function() {
    console.log('DOM ready.');
    var dpr = window.devicePixelRatio || 1;
    var M = M || window.Matter;
    var $stage = $('#stage');
    $stage.css({
      width: $stage.width() / dpr,
      height: $stage.height() / dpr
    });
    var engine = M.Engine.create($stage.get(0), {
      render: {
        options: {
          wireframes: true,
          width: 600,
          height: 400,
          background: 'rgba(0, 0, 0, 1)',
          showAngleIndicator: true
        }
      }
    });
    var $canvas = $stage.children('canvas');
    $canvas.css({
      width: $canvas.width() / dpr,
      height: $canvas.height() / dpr
    });
    var mouseConstraint = M.MouseConstraint.create(engine);
    M.World.add(engine.world, mouseConstraint);

    (new Fence()).create(engine);


    /*var hitsuji = M.Composite.create();
    
    var i = 0;
    for (; i < 6; i++) {
      var size = 10 + Math.random() * 6 - 2;
      var x = 300 + Math.random() * size - size / 2;
      var y = 200 + Math.random() * size - size / 2;
      var circ = M.Bodies.circle(x, y, size, {
        density: 0.1,
        frictionAir: 0.1,
        restitution: 0.9,
        friction: 0.1,
        render: {
          //fillStyle: 'rgba(255, 255, 255, 1)',
          //strokeStyle: 'rgba(255, 255, 255, 1)',
          //lineWidth: 0
        }
      });
      M.Composite.add(hitsuji, circ);
    }
    console.log(hitsuji);
    var a, b, dist, c;
    for (i = 1; i < hitsuji.bodies.length; i++) {
      a = hitsuji.bodies[i];
      b = hitsuji.bodies[i - 1];
      c = M.Constraint.create({
        bodyA: a,
        bodyB: b,
        pointA: { x: 0, y: 0 },
        pointB: { x: 0, y: 0 },
        stiffness: 1,
        length: a.circleRadius + b.circleRadius
      });
      M.Composite.add(hitsuji, c);
    }
    a = hitsuji.bodies[0];
    b = hitsuji.bodies[hitsuji.bodies.length - 1];
    M.Composite.add(hitsuji, M.Constraint.create({
      bodyA: a,
      bodyB: b,
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: a.circleRadius + b.circleRadius
    }));
    M.World.add(engine.world, [hitsuji]);*/

    var hitsuji = M.Composites.softBody(300, 200, 3, 2, 0, 0, true, 20, {
      render: {
        visible: true,
        fillStyle: '#FFFEF6',
        strokeStyle: '#FFFEF6',
        lineWidth: 0
      }
    }, {
      render: {
        visible: false
      }
    });
    var i = 0;
    var l = hitsuji.bodies.length;
    var c, x, y, leg, body;
    for (; i < l; i++) {
      body = hitsuji.bodies[i];
      if (i === 0) {
        body.render.sprite.texture = './img/head.png';
      } else if (i === l - 1) {
        body.render.sprite.texture = './img/tail.png';
      } else if (0 < i && i < 3) {
        body.render.sprite.texture = './img/bodyTop.png';
      } else {
        body.render.sprite.texture = './img/bodyBottom.png';
      }
    }
    var force = { x: Math.random() * 0.1 - .05, y: Math.random() * 0.1 - .05 };
    M.Body.applyForce(hitsuji.bodies[0], hitsuji.bodies[0].position, force);
    M.World.add(engine.world, [hitsuji]);

    M.Engine.run(engine);
  });
});

