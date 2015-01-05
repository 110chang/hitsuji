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
    'box2d'        : 'lib/Box2dWeb',
    'easel'        : 'lib/easeljs.min',
    'mod'          : 'mod'
  }
});

require([
  'mod/screen',
  'mod/browser',
  'mod/utils/raf',
  'app/b2',
  'box2d',
  'easel'
], function(Screen, Browser, raf, b2) {
  $(function() {
    console.log('DOM ready.');
    var CANVAS_WIDTH = 600;
    var CANVAS_HEIGHT = 400;
    var SCALE = 30;

    var world = new b2.World(new b2.Vec2(0, 10), true);

    // floor settings
    var fixDef = new b2.FixtureDef();
    fixDef.density = 1.0;
    fixDef.friction = 0.5;
    fixDef.restitution = 0.2;

    var bodyDef = new b2.BodyDef();
    bodyDef.type = b2.Body.b2_staticBody;
    // positions the center of the object (not upper left!)
    bodyDef.position.x = CANVAS_WIDTH / 2 / SCALE;
    bodyDef.position.y = CANVAS_HEIGHT / 1 / SCALE;

    fixDef.shape = new b2.PolygonShape();
    // half width, half height.
    fixDef.shape.SetAsBox(CANVAS_WIDTH / 2 / SCALE, 10 / 2 / SCALE);

    var body = world.CreateBody(bodyDef);
    body.CreateFixture(fixDef);

    // fix ball settings
    var b1fixDef = new b2.FixtureDef();
    b1fixDef.density = 1.0;
    b1fixDef.friction = 0.5;
    b1fixDef.restitution = 0.2;

    var b1bodyDef = new b2.BodyDef();
    b1bodyDef.type = b2.Body.b2_staticBody;
    // positions the center of the object (not upper left!)
    b1bodyDef.position.x = Math.random() * CANVAS_WIDTH / SCALE;
    b1bodyDef.position.y = Math.random() * CANVAS_HEIGHT / SCALE;

    b1fixDef.shape = new b2.CircleShape(10 / SCALE);

    var b1body = world.CreateBody(b1bodyDef)
    b1body.CreateFixture(b1fixDef);

    // free ball settings
    var b2fixDef = new b2.FixtureDef();
    b2fixDef.density = 1.0;
    b2fixDef.friction = 0.5;
    b2fixDef.restitution = 0.2;

    var b2bodyDef = new b2.BodyDef();
    b2bodyDef.type = b2.Body.b2_dynamicBody;
    // positions the center of the object (not upper left!)
    b2bodyDef.position.x = Math.random() * CANVAS_WIDTH / SCALE;
    b2bodyDef.position.y = Math.random() * CANVAS_HEIGHT / SCALE;

    b2fixDef.shape = new b2.CircleShape(10 / SCALE);

    var b2body = world.CreateBody(b2bodyDef);
    b2body.CreateFixture(b2fixDef);

    var jointDef = new b2.DistanceJointDef();
    jointDef.bodyA = b1body;
    jointDef.bodyB = b2body;
    jointDef.length = 50 / SCALE;
    jointDef.frequencyHz = 5;
    jointDef.dampingRatio = 0.1;
    jointDef.anchorPoint = b1body.GetWorldCenter();

    var joint = world.CreateJoint(jointDef);

    // mouse joint
    var mJointDef;
    var mJoint = null;
    var mouseX, mouseY;
    var isMouseDown = false;
    var selectedBody;
    var mousePVec;
    
    function handleMouseMove(e) {
      //console.log(e.offsetX, e.offsetY);
      mouseX = e.offsetX / SCALE;
      mouseY = e.offsetY / SCALE;
    };

    function getBodyAtMouse() {
      //console.log(mouseX, mouseY);
      mousePVec = new b2.Vec2(mouseX, mouseY);
      var aabb = new b2.AABB();
      aabb.lowerBound.Set(mouseX - 0.001, mouseY - 0.001);
      aabb.upperBound.Set(mouseX + 0.001, mouseY + 0.001);
     
      // Query the world for overlapping shapes.

      selectedBody = null;
      world.QueryAABB(getBodyCB, aabb);
      return selectedBody;
    }

    function getBodyCB(fixture) {
      //console.log(fixture.GetBody().GetType() != b2.Body.b2_staticBody);
      if(fixture.GetBody().GetType() != b2.Body.b2_staticBody) {
        if(fixture.GetShape().TestPoint(fixture.GetBody().GetTransform(), mousePVec)) {
          selectedBody = fixture.GetBody();
          return false;
        }
      }
      return true;
    }

    function onMouseDown(e) {
      console.log('start drag');
      isMouseDown = true;
      handleMouseMove(e);
      $debug.on('mousemove', onMouseMove);
    }
    function onMouseMove(e) {
      console.log('dragging');
      handleMouseMove(e);
    }
    function onMouseUp(e) {
      console.log('stop drag');
      isMouseDown = false;
      $debug.off('mousemove', onMouseMove);
    }

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
    
    // exec ticker
    var fps = 1 / 60;
    var steps = 100;
    var count = 0;
    var listner;
    var pos;
    
    listner = Ticker.on('tick', function(e) {
      if(isMouseDown && (!mJoint)) {
        var body = getBodyAtMouse();
        if(body) {
          mJointDef = new b2.MouseJointDef();
          mJointDef.bodyA = world.GetGroundBody();
          mJointDef.bodyB = body;
          mJointDef.target.Set(mouseX, mouseY);
          mJointDef.maxForce = body.GetMass() * 1000;
          mJointDef.collideConnected = true;
          mJoint = world.CreateJoint(mJointDef);
          body.SetAwake(true);
        }
      }

      if(mJoint) {
         if(isMouseDown) {
            mJoint.SetTarget(mousePVec);
         } else {
            world.DestroyJoint(mJoint);
            mJoint = null;
         }
      }

      world.Step(e.delta / 1000, 10, 10);
      world.DrawDebugData();
      world.ClearForces();
    });

    $debug.on('mousedown', onMouseDown);
    $debug.on('mouseup', onMouseUp);
  });
});

