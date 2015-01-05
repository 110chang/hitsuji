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

  function Title(msg) {
    CW = cnf.CANVAS_WIDTH;
    CH = cnf.CANVAS_HEIGHT;
    SCALE = cnf.SCALE;

    this.msg = msg || '';
    this.center = { x: CW / 2, y: CH / 2 };
  }
  extend(Title.prototype, {
    msg: '',
    composite: null,

    create: function(engine) {
      var title = M.Composite.create();
      var i = 0;
      var x = 60, y = 60;
      var chr, path, body;

      for (; i < this.msg.length; i++) {
        chr = this.msg[i];
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
          label: 'Title-' + chr,
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
