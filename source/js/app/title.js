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

  var message = 'A HAPPY\nNEW YEAR\n2015';
  var charactors = {
    A: {
      path: '0.4,60 34.9,0 69.3,60',
      width: 60,
    },
    H: {
      path: '30,2 30,20.3 20,20.3 20,2 0,2 0,60 20,60 20,40.3 30,40.3 30,60 50,60 50,2',
      width: 50,
    },
    P: {
      path: '47.3,10.7 41.6,5 34.2,2 20,2 0,2 0,60 20,60 20,42 34.2,42 41.6,39 47.3,33.3 50.4,26 50.4,18',
      width: 50,
    },
    Y: {
      path: '60,2 0,2 20,36.6 20,60 40,60 40,36.6',
      width: 60,
    },
    N: {
      path: '30,2 30,36 0,0 0,60 50,60 50,2',
      width: 50,
    },
    E: {
      path: '50,2 0,2 0,60 50,60 50,41 20,41 37.3,31 20,21 50,21',
      width: 50,
    },
    W: {
      path: '70,2 0,2 20,62 35,17 50,62',
      width: 70,
    },
    R: {
      path: '47.3,10.7 41.6,5 34.2,2 20,2 0,2 0,60 43,60 20,42 34.2,42 41.6,39 47.3,33.3 50.4,26 50.4,18',
      width: 50,
    },
    n2: {
      path: '50,22 46.2,12.8 39.2,5.8 30,2 20,2 10.8,5.8 3.8,12.8 0,22 0,32 23.8,32 0,60 50,60 50,42 41.5,42 50,32',
      width: 50,
    },
    n0: {
      path: '23.2,60 12.6,55.6 4.4,47.4 0,36.8 0,25.2 4.4,14.6 12.6,6.4 23.2,2 34.8,2 45.4,6.4 53.6,14.6 58,25.2 58,36.8 53.6,47.4 45.4,55.6 34.8,60',
      width: 60,
    },
    n1: {
      path: '20,60 0,60 0,20 20,0',
      width: 20,
    },
    n5: {
      path: '50,2 0,2 0,40 20,40 0,60 34,60 41.3,57 47,51.3 50,44 50,36 47,28.7 41.3,23 34,20 50,20',
      width: 50,
    }
  };

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
      var i = 0;
      var x = 60, y = 60;

      for (; i < message.length; i++) {
        var chr = message[i];
        if (/[0-9]/.test(chr)) {
          chr = 'n' + chr;
        }
        if (chr === '\n') {
          x = 60;
          y += 80;
          continue;
        }
        if (/\s+/.test(chr)) {
          x += 60;
          continue;
        }
        //console.log(chr);
        var path = this._svgToPath(charactors[chr].path);
        //console.log(path);
        
        var shape = {
          label: 'title-' + chr,
          position: {
            x: x,
            y: y
          },
          vertices: M.Vertices.fromPath(path),
          render: {
            //fillStyle: '#C00',
            //lineWitdh: 0
          }
        };
        var body = M.Body.create(M.Common.extend({}, shape), {
          density: 0.01,
          restitution: 1,
        });
        //M.Composite.add(title, body);
        M.World.add(engine.world, body);
        console.log(body);
        x += charactors[chr].width + 10;
      }
      
      this.composite = title;
      //M.World.add(engine.world, title);

      return title;
    },
    _svgToPath: function(str) {
      return str.split(' ').map(function(e) {
        return 'L' + e.split(',').join(' ');
      }).join(' ');
    }
  });

  return Title;
});
