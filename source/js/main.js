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
    "jquery.easing": [
      "jquery"
    ]
  }
});

require([
  'mod/nav/anchor',
  'mod/screen',
  'mod/browser',
  'mod/utils/raf',
  'app/b2',
  'box2d',
  'easel'
], function(Anchor, Screen, Browser, raf, b2) {
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
          Math.random() + 0.1 //half width
         ,Math.random() + 0.1 //half height
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
    
    /*function update() {
       world.Step(
             1 / 60   //frame-rate
          ,  10       //velocity iterations
          ,  10       //position iterations
       );
       world.DrawDebugData();
       world.ClearForces();
         
       window.requestAnimationFrame(update);
    }; // update()
    window.requestAnimationFrame(update);*/
    // easeljs settings
    /*var screen = new Screen();
    var $canvas = $('#stage');
    var stage = new Stage($canvas.get(0));
    var dpr = window.devicePixelRatio || 1;
    var stageWidth = 600;//screen.width();
    var stageHeight = 400;//screen.height();
    var hiWidth = stageWidth * dpr;
    var hiHeight = stageHeight * dpr;
    var circ = (function() {
      var g = new Graphics();
      g.ss(1).s('#000').dc(0, 0, 10);
      var s = new Shape(g);
      s.x = Math.random() * hiWidth;
      s.y = Math.random() * hiHeight;
      console.log(s);
      return s;
    }());
    var floor = (function() {
      var g = new Graphics();
      g.ss(0.5).s('#808080').dr(0, 0, stageWidth * dpr, 10 * dpr);
      var s = new Shape(g);
      s.x = 0;
      s.y = stageHeight * dpr - 10 * dpr;
      return s;
    }());

    stage.setBounds(0, 0, hiWidth, hiHeight);
    $canvas.attr('width', hiWidth).attr('height', hiHeight).css({
      width: stageWidth,
      height: stageHeight
    });
    stage.addChild(circ);
    stage.addChild(floor);

    // box2d settings
    var scale = 1 / 30;
    var gravity = new Box2D.Common.Math.b2Vec2(0, 15);
    var world = new Box2D.Dynamics.b2World(gravity, true);
    var velocityIterations = 8;
    var positionIterations = 3;

    var def = new Box2D.Dynamics.b2BodyDef();
    def.position.Set(circ.x * scale, circ.y * scale);
    def.type = Box2D.Dynamics.b2Body.b2_dynamicBody;
    var fix = new Box2D.Dynamics.b2FixtureDef();
    fix.density = 1.0;     // 密度
    fix.friction = 0.5;    // 摩擦係数
    fix.restitution = 0.4; // 反発係数
    fix.shape = new Box2D.Collision.Shapes.b2CircleShape(10 * scale);

    //def.userDate = circ;
    var defFl = new Box2D.Dynamics.b2BodyDef();
    defFl.position.Set(floor.x, floor.y);
    defFl.type = Box2D.Dynamics.b2Body.b2_staticBody;

    var body = world.CreateBody(def).CreateFixture(fix);

    // debug canvas
    var $debug = $('#debug');
    $debug.attr('width', 600).attr('height', 400);
    var debugDraw = new Box2D.Dynamics.b2DebugDraw();
    debugDraw.SetSprite($debug.get(0).getContext('2d'));
    debugDraw.SetDrawScale(scale);
    debugDraw.SetFillAlpha(0.5);
    debugDraw.SetLineThickness(1.0);
    debugDraw.SetFlags(Box2D.Dynamics.b2DebugDraw.e_shapeBit);
    world.SetDebugDraw(debugDraw);*/

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
      //console.log('Ticker#tick');
      //world.Step(fps, velocityIterations, positionIterations);
      //pos = world.GetBodyList().GetPosition();
      //circ.x = pos.x / scale;
      //circ.y = pos.y / scale;
      //stage.update();
      //world.DrawDebugData();

      //count++;

      //if (count > steps) {
      //  Ticker.off('tick', listner);
      //}
    });
  });
});

