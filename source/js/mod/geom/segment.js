/*
*
*   geom.Segment r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like',
  'mod/geom/vector',
  'mod/geom/point'
], function(extend, like, Vector, Point) {

  var atan2 = Math.atan2;
  var PI    = Math.PI;

  function Segment() {
    if (!(this instanceof Segment)) {
      throw new Error('Can not be initialized without `new`.');
    }
    var a, b, i;

    if (arguments.length < 2) {
      throw new Error('Not enough arguments');
    } else if (arguments.length === 2 || arguments.length === 3) {
      a = arguments[0];
      b = arguments[1];
      // Type of arguments must be Geometry.Point. Ignore 3rd argument
      if (!like(a, Point.prototype) || !like(b, Point.prototype)) {
        throw new Error('Invalid arguments.');
      }
      this.start     = a;
      this.end       = b;
      this.direction = a.angleBetween(b);
      this.length    = a.distanceTo(b);
    } else if (arguments.length > 3) {
      // Type of arguments must be Number. Remainings are ignore.
      for (i = 0; i < 4; i++) {
        if (typeof(arguments[i]) !== 'number') {
          throw new Error('Invalid arguments.');
        }
      }
      this.start     = new Point(arguments[0], arguments[1]);
      this.end       = new Point(arguments[2], arguments[3]);
      this.direction = this.start.angleBetween(this.end);
      this.length    = this.start.distanceTo(this.end);
    }
  }
  extend(Segment.prototype, {
    start     : null,
    end       : null,
    direction : 0,
    length    : 0,

    contain: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Number.');
      }
      var x0 = this.start.x;
      var y0 = this.start.y;
      var x1 = this.end.x;
      var y1 = this.end.y;
      
      if (point.x < x0 || point.y < y0 || x1 < point.x || y1 < point.y) {
        return false;
      }
      return (y1 - y0) * point.x - (x1 - x0) * point.y - x0 * y1 + x1 * y0 === 0;
    },
    intersection: function(segment) {
      if (!like(segment, Segment.prototype)) {
        throw new Error('Arguments must be Segment.');
      }
      // ### Avoid a circular dependencies ###
      var Triangle = require('mod/geom/triangle');
      var t1 = new Triangle(this.start, this.end, segment.start);
      var t2 = new Triangle(this.start, this.end, segment.end);
      var t3 = new Triangle(segment.start, segment.end, this.start);
      var t4 = new Triangle(segment.start, segment.end, this.end);
      var I  = false;
      
      if (t1.getArea() * t2.getArea() < 0 && t3.getArea() * t4.getArea() < 0) {
        I = this._getIntersection(segment);
      }
      return I;
    },
    _getIntersection: function(segment) {
      if (!like(segment, Segment.prototype)) {
        throw new Error('Arguments must be Segment.');
      }
      var s0 = this;
      var s1 = segment;
      var AB = new Vector(s0.end.x   - s0.start.x, s0.end.y   - s0.start.y);
      var CD = new Vector(s1.end.x   - s1.start.x, s1.end.y   - s1.start.y);
      var AC = new Vector(s1.start.x - s0.start.x, s1.start.y - s0.start.y);
      var cpAB = CD.crossProduct(AB);
      var cpAC = CD.crossProduct(AC);
      
      AB.scalarMultiply(cpAC / cpAB);
      //console.log(AB.x + ', ' + AB.y);
      return new Point(s0.start.x + AB.x, s0.start.y + AB.y);
    },
    distance: function() {
      return this.length;
    },
    middlePoint: function() {
      return this.start.middlePointOf(this.end);
    },
    getAngle: function(asRadian) {
      asRadian = asRadian == null ? true : asRadian;
      var radian = atan2(this.end.y - this.start.y, this.end.x - this.start.x);
      return (asRadian) ? radian : radian * 180 / Math.PI;
    },
    angleBetween: function(segment, asRadian) {
      if (!like(segment, Segment.prototype)) {
        throw 'arguments must be geom.Segment.';
      }
      if (asRadian === undefined) { asRadian = true; }
      var radian = segment.getAngle() - this.getAngle();
      
      return (asRadian) ? radian : radian * 180 / PI;
    },
    toString: function() {
      return '( ' + this.start.x + ', ' + this.start.y + ' ) -> ( ' + this.end.x + ', ' + this.end.y + ' )';
    }
  });

  return Segment;
});