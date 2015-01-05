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

    world.CreateBody(bodyDef).CreateFixture(fixDef);

    bodyDef.type = b2.Body.b2_dynamicBody;
    for(var i = 0; i < 10; ++i) {
      if(Math.random() > 0.5) {
        fixDef.shape = new b2.PolygonShape();
        fixDef.shape.SetAsBox(
          Math.random() + 0.1, //half width
          Math.random() + 0.1 //half height
        );
      } else {
        fixDef.shape = new b2.CircleShape(
          Math.random() + 0.1 //radius
        );
      }
      bodyDef.position.x = Math.random() * 25;
      bodyDef.position.y = Math.random() * 10;
      world.CreateBody(bodyDef).CreateFixture(fixDef);
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
      world.Step(e.delta / 1000, 10, 10);
      world.DrawDebugData();
      world.ClearForces();
    });
  });
});

