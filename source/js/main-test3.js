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
    'box2d'        : 'lib/Box2dWeb',
    'easel'        : 'lib/easeljs.min',
    'mod'          : 'mod'
  },
  "shim": {
    "jquery.easing": ["jquery"]
  }
});

require([
  'mod/nav/anchor',
  'mod/screen',
  'mod/utils/raf',
  'app/b2',
  'app/fence',
  'box2d',
  'easel'
], function(Anchor, Screen, raf, b2) {
  $(function() {
    console.log('DOM ready.');
    var CANVAS_WIDTH = 600;
    var CANVAS_HEIGHT = 400;
    var SCALE = 30;
    var GRAVITY = new b2.Vec2(0, 10);
    var world = new b2.World(GRAVITY, true);

    //setup debug draw
    var $debug = $('#debug');
    $debug.attr('width', CANVAS_WIDTH).attr('height', CANVAS_HEIGHT);
    var debugDraw = new b2.DebugDraw();
    debugDraw.SetSprite($debug.get(0).getContext("2d"));
    debugDraw.SetDrawScale(SCALE);
    debugDraw.SetFillAlpha(0.3);
    debugDraw.SetLineThickness(1.0);
    debugDraw.SetFlags(b2.DebugDraw.e_shapeBit | b2.DebugDraw.e_jointBit);
    world.SetDebugDraw(debugDraw);

    function createFence() {
      var i = 0;
      var fixDef, bodyDef, body;

      for(; i < 4; i++) {

        fixDef = new b2.FixtureDef();
        fixDef.density = 1.0; //密度
        fixDef.friction = 0.5; //摩擦
        fixDef.restitution = 0.2; //弾性

        bodyDef = new b2.BodyDef();
        bodyDef.type = b2.Body.b2_staticBody;
        // positions the center of the object (not upper left!)
        bodyDef.position.x = CANVAS_WIDTH * (1 - Math.abs(1 - i) / 2) / SCALE;
        bodyDef.position.y = CANVAS_HEIGHT * (1 - Math.abs(2 - i) / 2) / SCALE;

        fixDef.shape = new b2.PolygonShape();
        // half width, half height.
        fixDef.shape.SetAsBox(
          Math.pow(CANVAS_WIDTH, (i + 1) % 2) / SCALE,
          Math.pow(CANVAS_HEIGHT, i % 2) / SCALE);

        body = world.CreateBody(bodyDef);
        body.CreateFixture(fixDef);
      }
    }
    createFence();

    // create hitsuji settings
    var i = 0;
    var max = 6;
    var prevBody;
    var firstBody;
    var center = new b2.Vec2(CANVAS_WIDTH / 2 / SCALE, CANVAS_HEIGHT / 2 / SCALE);
    for(; i < max; i++) {
      var size = 10 + (Math.random() * 4 - 2);

      var fixDef = new b2.FixtureDef();
      fixDef.density = 1.0; //密度
      fixDef.friction = 0.7; //摩擦
      fixDef.restitution = 1; //弾性

      var bodyDef = new b2.BodyDef();
      bodyDef.type = b2.Body.b2_dynamicBody;
      // positions the center of the object (not upper left!)
      bodyDef.position.x = center.x + Math.random() * size / SCALE;
      bodyDef.position.y = center.y + Math.random() * size / SCALE;

      fixDef.shape = new b2.CircleShape(size / SCALE);

      var body = world.CreateBody(bodyDef)
      body.CreateFixture(fixDef);

      if (prevBody) {
        var jointDef = new b2.DistanceJointDef();
        jointDef.bodyA = prevBody;
        jointDef.bodyB = body;
        jointDef.length = size / SCALE;
        jointDef.frequencyHz = 5;
        jointDef.dampingRatio = 0.1;
        jointDef.anchorPoint = body.GetWorldCenter();

        var joint = world.CreateJoint(jointDef);
      } else {
        firstBody = body;
      }
      prevBody = body;

      if (i === max - 1) {
        var jointDef = new b2.DistanceJointDef();
        jointDef.bodyA = body;
        jointDef.bodyB = firstBody;
        jointDef.length = size / SCALE;
        jointDef.frequencyHz = 5;
        jointDef.dampingRatio = 0.1;
        jointDef.anchorPoint = firstBody.GetWorldCenter();

        var joint = world.CreateJoint(jointDef);
      }
    }

    
    // exec ticker
    var fps = 1 / 60;
    var steps = 100;
    var count = 0;
    var listner;
    var pos;
    
    listner = Ticker.on('tick', function(e) {

      world.Step(e.delta / 1000, 10, 10);
      world.DrawDebugData();
      world.ClearForces();
    });
  });
});

