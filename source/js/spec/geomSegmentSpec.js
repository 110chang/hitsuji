/*
*
*   Spec/geom.Segment
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/geom/point',
  'mod/geom/segment'
], function(extend, Point, Segment) {
  describe("Test case: geom.Segment", function() {
    var s, t, u, P, Q, R, S;

    beforeEach(function () {
      P = new Point(10, 10);
      Q = new Point(20, 20);
      R = new Point(-10, 10);
      S = new Point(20, -20);
    });

    it('can create instance', function() {
      s = new Segment(P, Q);
      expect(s instanceof Segment).toBeTruthy();
      expect(s.start).toEqual(P);
      expect(s.end).toEqual(Q);
      expect(s.direction).toEqual(Math.PI / 4);
      expect(s.length).toEqual(Math.sqrt(10 * 10 + 10 * 10));

      t = new Segment(100, 100, 200, 200);
      expect(t.start).toEqual(Point(100, 100));
      expect(t.end).toEqual(Point(200, 200));
      expect(t.direction).toEqual(Math.PI / 4);
      expect(t.length).toEqual(Math.sqrt(100 * 100 + 100 * 100));
    });

    it('knows contain some point in itself.', function() {
      s = new Segment(P, Q);
      expect(s.contain(Point(15, 15))).toBeTruthy();
      expect(s.contain(Point(10, 20))).toBeFalsy();
    });

    it('knows intersect with other segment.', function() {
      s = new Segment(P, Q);
      t = new Segment(10, 20, 20, 10);
      u = new Segment(20, 20, 40, 20);
      expect(s.intersection(t)).toBeTruthy();
      expect(s.intersection(t)).toEqual(Point(15, 15));
      expect(s.intersection(u)).toBeFalsy();
    });

    it('calc distance of segment.', function() {
      s = new Segment(P, Q);
      expect(s.distance()).toEqual(Math.sqrt(10 * 10 + 10 * 10));
    });

    it('calc middlePoint of segment.', function() {
      s = new Segment(P, Q);
      expect(s.middlePoint()).toEqual(P.middlePointOf(Q));
    });

    it('calc angle of segment.', function() {
      s = new Segment(P, Q);
      expect(s.getAngle()).toEqual(Math.PI / 4);
      expect(s.getAngle(false)).toEqual(45);
    });

    it('calc angle between an other segment.', function() {
      s = new Segment(P, Q);
      t = new Segment(10, 20, 20, 10);
      expect(s.angleBetween(t)).toEqual(-Math.PI / 2);
      expect(s.angleBetween(t, false)).toEqual(-90);
    });

    it('to string representation.', function() {
      s = new Segment(P, Q);
      expect(s.toString()).toEqual('( 10, 10 ) -> ( 20, 20 )');
    });
  });
});