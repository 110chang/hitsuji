/*
*
*   geom.Triangle r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like',
  'mod/geom/point',
  'mod/geom/segment'
], function(extend, like, Point, Segment) {
  var abs = Math.abs;
  var sin = Math.sin;
  var cos = Math.cos;

  function isPoint(point) {
    return like(point, Point.prototype);
  }
  function Triangle(start, middle, end) {
    if (!isPoint(start) || !isPoint(middle) || !isPoint(end)) {
      throw new Error('Arguments must be Point.');
    }
    if (!(this instanceof Triangle)) {
      return new Triangle(start, middle, end);
    }
    this.start  = start;
    this.middle = middle;
    this.end    = end;

    this._initialize();
  }
  extend(Triangle.prototype, {
    start         : null,
    middle        : null,
    end           : null,
    area          : 0,
    gravityCenter : null,
    circumCenter  : null,
    segmentA      : null,
    segmentB      : null,
    segmentC      : null,
    angleA        : 0,
    angleB        : 0,
    angleC        : 0,
    
    _initialize: function() {
      // Calcurate in advance
      var x0 = this.start.x;
      var y0 = this.start.y;
      var x1 = this.middle.x;
      var y1 = this.middle.y;
      var x2 = this.end.x;
      var y2 = this.end.y;
      var area = ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
      var ac = new Segment(x0, y0, x2, y2);
      var ab = new Segment(x0, y0, x1, y1);
      var ba = new Segment(x1, y1, x0, y0);
      var bc = new Segment(x1, y1, x2, y2);
      var cb = new Segment(x2, y2, x1, y1);
      var ca = new Segment(x2, y2, x0, y0);

      this.area = area;
      this.gravityCenter = new Point((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3);
      
      var angleA = abs(ac.angleBetween(ab));
      var angleB = abs(ba.angleBetween(bc));
      var angleC = abs(cb.angleBetween(ca));
      this.angleA = angleA;
      this.angleB = angleB;
      this.angleC = angleC;
      
      this.segmentA = new Segment(this.middle, this.end);
      this.segmentB = new Segment(this.end, this.start);
      this.segmentC = new Segment(this.start, this.middle);
      
      this.circumCenter = (function() {
        var a2A = 2 * sin(angleA) * cos(angleA);
        var a2B = 2 * sin(angleB) * cos(angleB);
        var a2C = 2 * sin(angleC) * cos(angleC);
        var xc = (x0 * a2A + x1 * a2B + x2 * a2C) / (a2A + a2B + a2C);
        var yc = (y0 * a2A + y1 * a2B + y2 * a2C) / (a2A + a2B + a2C);
        
        return new Point(xc, yc);
      }());
    },
    getVertices: function() {
      return [this.start, this.middle, this.end];
    },
    getArea: function(asSigned) {
      asSigned = asSigned == null ? true : asSigned;
      return (asSigned) ? this.area : abs(this.area);
    },
    getGravityCenter: function() {
      return this.gravityCenter;
    },
    getCircumCenter: function() {
      return this.circumCenter;
    },
    translate: function(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number') {
         throw new Error('Arguments must be Number.');
      }
      this.start.translate(x, y);
      this.middle.translate(x, y);
      this.end.translate(x, y);

      this._initialize();
    },
    contain: function(point) {
      if (!isPoint(point)) {
        throw new Error('Arguments must be Point.');
      }
      var Segment = require('mod/geom/segment');
      var seg = new Segment(point, this.gravityCenter);
      var f = function(edge) {
        return seg.intersection(edge);
      };
      return !f(this.segmentA) && !f(this.segmentB) && !f(this.segmentC);
    }
  });

  return Triangle;
});