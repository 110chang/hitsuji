/*
*
*   Spec/Browser
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/browser',
  'mod/utils/useragent'
], function(Browser, UserAgent) {
  describe("Test case: Browser", function() {
    beforeEach(function () {
      
    });

    it('can detect IE (less than 11)', function() {
      expect(Browser(UserAgent.IE6).IE()).toBeTruthy();
      expect(Browser(UserAgent.IE7).IE()).toBeTruthy();
      expect(Browser(UserAgent.IE8).IE()).toBeTruthy();
      expect(Browser(UserAgent.IE9).IE()).toBeTruthy();
      expect(Browser(UserAgent.IE10).IE()).toBeTruthy();
      expect(Browser(UserAgent.IE11).IE()).toBeFalsy();
    });

    it('can detect IE11', function() {
      expect(Browser(UserAgent.IE11).IE11()).toBeTruthy();
    });

    it('can detect iPhone', function() {
      expect(Browser(UserAgent.iPhone_iOS5).iPhone()).toBeTruthy();
      expect(Browser(UserAgent.iPhone_iOS6).iPhone()).toBeTruthy();
      expect(Browser(UserAgent.iPhone_iOS7).iPhone()).toBeTruthy();
      expect(Browser(UserAgent.iPhone_iOS8).iPhone()).toBeTruthy();
      expect(Browser(UserAgent.iPad_iOS8).iPhone()).toBeFalsy();
    });

    it('can detect iPad', function() {
      expect(Browser(UserAgent.iPad_iOS5).iPad()).toBeTruthy();
      expect(Browser(UserAgent.iPad_iOS6).iPad()).toBeTruthy();
      expect(Browser(UserAgent.iPad_iOS7).iPad()).toBeTruthy();
      expect(Browser(UserAgent.iPad_iOS8).iPad()).toBeTruthy();
      expect(Browser(UserAgent.iPhone_iOS8).iPad()).toBeFalsy();
    });

    it('can detect Android', function() {
      expect(Browser(UserAgent.Android_23).Android()).toBeTruthy();
      expect(Browser(UserAgent.Android_321_Tab).Android()).toBeTruthy();
      expect(Browser(UserAgent.Android_401).Android()).toBeTruthy();
      expect(Browser(UserAgent.Android_411_Tab).Android()).toBeTruthy();
    });

    it('can detect Webkit', function() {
      expect(Browser(UserAgent.Chrome).WebKit()).toBeTruthy();
      expect(Browser(UserAgent.Firefox).WebKit()).toBeFalsy();
      expect(Browser(UserAgent.Safari).WebKit()).toBeTruthy();
      expect(Browser(UserAgent.iPhone_iOS8).WebKit()).toBeTruthy();
      expect(Browser(UserAgent.Android_411_Tab).WebKit()).toBeTruthy();
    });

    it('can detect Android mobile device', function() {
      expect(Browser(UserAgent.Firefox).mobile()).toBeFalsy();
      expect(Browser(UserAgent.iPhone_iOS8).mobile()).toBeFalsy();
      expect(Browser(UserAgent.iPad_iOS8).mobile()).toBeFalsy();
      expect(Browser(UserAgent.Android_401).mobile()).toBeTruthy();
      expect(Browser(UserAgent.Android_411_Tab).mobile()).toBeFalsy();
    });

    it('can detect small screen device', function() {
      expect(Browser(UserAgent.Firefox).smallScreen()).toBeFalsy();
      expect(Browser(UserAgent.iPhone_iOS8).smallScreen()).toBeTruthy();
      expect(Browser(UserAgent.iPad_iOS8).smallScreen()).toBeFalsy();
      expect(Browser(UserAgent.Android_401).smallScreen()).toBeTruthy();
      expect(Browser(UserAgent.Android_411_Tab).smallScreen()).toBeFalsy();
    });

    it('can detect tablet device', function() {
      expect(Browser(UserAgent.Firefox).tablet()).toBeFalsy();
      expect(Browser(UserAgent.iPhone_iOS8).tablet()).toBeFalsy();
      expect(Browser(UserAgent.iPad_iOS8).tablet()).toBeTruthy();
      expect(Browser(UserAgent.Android_401).tablet()).toBeFalsy();
      expect(Browser(UserAgent.Android_411_Tab).tablet()).toBeTruthy();
    });

    it('can detect platform', function() {
      expect(Browser(UserAgent.Firefox, "Windows 8.1").Windows()).toBeTruthy();
      expect(Browser(UserAgent.Safari, "MacIntel").Mac()).toBeTruthy();
      expect(Browser(UserAgent.Firefox, "Linux").Windows()).toBeFalsy();
    });


  }); 
});