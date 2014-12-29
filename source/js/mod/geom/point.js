/*
*
*   geom.Point r2
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like'
], function(extend, like) {
  var sqrt  = Math.sqrt;
  var pow   = Math.pow;
  var atan2 = Math.atan2;
  var PI    = Math.PI;

  function Point(x, y) {
    if (!(this instanceof Point)) {
      return new Point(x, y);
    }
    x = typeof x === 'number' ? x : 0;
    y = typeof y === 'number' ? y : 0;
    this.x = x;
    this.y = y;
  }
  extend(Point.prototype, {
    x: 0,
    y: 0,
    translate: function(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error('Arguments must be Number.');
      }
      this.x += x;
      this.y += y;
      
      return this;
    },
    slopeBetween: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      return (point.y - this.y) / (point.x - this.x);
    },
    angleBetween: function(point, asRadian) {
      asRadian = asRadian == null ? true : asRadian;
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      var radian = atan2(point.y - this.y, point.x - this.x);
      return (asRadian) ? radian : radian * 180 / PI;
    },
    distanceTo: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      return sqrt(pow(point.x - this.x, 2) + pow(point.y - this.y, 2));
    },
    middlePointOf: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      return new Point((this.x + point.x) / 2, (this.y + point.y) / 2);
    },
    toString: function() {
      return '( ' + this.x + ', ' + this.y + ' )';
    }
  });

  return Point;
});
