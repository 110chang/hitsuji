/*
*
*   App/Title
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'app/cnf',
  'app/charactors',
  'matter'
], function(extend, cnf, charactors, M) {
  M = M || window.Matter;
  var CW, CH, SCALE;
  var message = 'A HAPPY\nNEW YEAR\n2015';

  function Title() {
    CW = cnf.CANVAS_WIDTH;
    CH = cnf.CANVAS_HEIGHT;
    SCALE = cnf.SCALE;

    this.center = { x: CW / 2, y: CH / 2 };
  }
  extend(Title.prototype, {
    composite: null,

    create: function(engine) {
      var title = M.Composite.create();
      var i = 0;
      var x = 60, y = 60;
      var chr, path, body;

      for (; i < message.length; i++) {
        chr = message[i];
        if (/[0-9]/.test(chr)) {
          chr = 'n' + chr;
        }
        if (chr === '\n') {
          x = 60;
          y += 80;
          continue;
        }
        if (/\s+/.test(chr)) {
          x += 50;
          continue;
        }
        path = this._svgToPath(charactors[chr].path);
        body = M.Body.create({
          label: 'title-' + chr,
          position: {
            x: x + charactors[chr].supple.x,
            y: y + charactors[chr].supple.y
          },
          vertices: M.Vertices.fromPath(path),
          restitution: 0.9
        });
        M.Composite.add(title, body);
        x += charactors[chr].width + 10;
      }
      this.composite = title;
      M.World.add(engine.world, title);

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
