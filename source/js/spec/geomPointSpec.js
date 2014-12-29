/*
*
*   Spec/geom.Point
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/geom/point'
], function(extend, inherit, Point) {
  describe("Test case: geom.Point", function() {
    var P, Q, R, S;
    
    beforeEach(function () {
      P = new Point();
    });

    it('can create instance', function() {
      expect(P instanceof Point).toBeTruthy();
      expect(P.x).toEqual(0);
      expect(P.y).toEqual(0);

      Q = Point(1, 2);
      expect(Q instanceof Point).toBeTruthy();
      expect(Q.x).toEqual(1);
      expect(Q.y).toEqual(2);

      R = new Point(10, 20);
      expect(R instanceof Point).toBeTruthy();
      expect(R.x).toEqual(10);
      expect(R.y).toEqual(20);
    });

    it('can translate coords.', function() {
      P.translate(1, 2);
      expect(P.x).toEqual(1);
      expect(P.y).toEqual(2);
    });

    it('can calc slope between an other point.', function() {
      P.translate(100, 200);
      Q = new Point(200, 100);
      expect(P.slopeBetween(Q)).toEqual(-1);

      R = new Point();
      S = new Point(20, 30);
      expect(R.slopeBetween(S)).toEqual(1.5);
    });

    it('can calc angle between an other point.', function() {
      P.translate(100, 200);
      Q = new Point(200, 100);
      expect(P.angleBetween(Q)).toEqual(-45 / 180 * Math.PI);

      R = new Point();
      S = new Point(10, 20);
      var result = Math.asin(20 / Math.sqrt(500)) * 180 / Math.PI;
      expect(R.angleBetween(S, false)).toEqual(result);
    });

    it('can calc distance to an other point.', function() {
      P.translate(100, 200);
      Q = new Point(200, 100);
      expect(P.distanceTo(Q)).toEqual(Math.sqrt(100 * 100 + 100 * 100));

      R = new Point();
      S = new Point(10, 20);
      expect(R.distanceTo(S)).toEqual(Math.sqrt(10 * 10 + 20 * 20));
    });

    it('can calc middle point of an other point.', function() {
      P.translate(100, 200);
      Q = new Point(200, 100);
      expect(P.middlePointOf(Q)).toEqual(Point(150, 150));

      R = new Point();
      S = new Point(10, 20);
      expect(R.middlePointOf(S)).toEqual(Point(5, 10));
    });

    it('to string representation.', function() {
      P.translate(100, 200);
      Q = new Point(200, 100);
      expect(P.toString()).toEqual('( 100, 200 )');
      expect(Q.toString()).toEqual('( 200, 100 )');

      R = new Point();
      S = new Point(10, 20);
      expect(R.toString()).toEqual('( 0, 0 )');
      expect(S.toString()).toEqual('( 10, 20 )');
    });

  }); 
});