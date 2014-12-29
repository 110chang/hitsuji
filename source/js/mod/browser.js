/*
*
*   Utils.Browser r2
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/utils/legacyie'
], function(extend, _ie) {
  var _userAgent = navigator.userAgent;
  function _is_IE(ua) {
    return /MSIE/.test(ua);
  }
  function _is_IE11(ua) {
    return /Trident/.test(ua);
  }
  function _is_iPhone(ua) {
    return /iPhone/.test(ua);
  }
  function _is_iPad(ua) {
    return /iPad/.test(ua);
  }
  function _is_Android(ua) {
    return /Android/.test(ua);
  }
  function _is_mobile(ua) {
    return /Mobile/.test(ua); // Android only
  }
  function _is_WebKit(ua) {
    return /WebKit/.test(ua);
  }
  function _is_windows(platform) {
    return /Win/.test(platform);
  }
  function _is_mac(platform) {
    return /Mac/.test(platform);
  }

  function Browser(_userAgent, _platform) {
    if (!(this instanceof Browser)) {
      return new Browser(_userAgent, _platform);
    }
    /* user agent strings for testing */
    this.userAgent = _userAgent || navigator.userAgent;
    this.platform = _platform || navigator.platform;
    this.ua = this.userAgent;
  }
  extend(Browser.prototype, {
    ie: _ie,
    IE: function() {
      return _is_IE(this.ua);
    },
    IE11: function() {
      return _is_IE11(this.ua);
    },
    iPhone: function() {
      return _is_iPhone(this.ua);
    },
    iPad: function() {
      return _is_iPad(this.ua);
    },
    Android: function() {
      return _is_Android(this.ua);
    },
    WebKit: function() {
      return _is_WebKit(this.ua);
    },
    mobile: function() {
      // Android only
      return _is_mobile(this.ua) && _is_Android(this.ua);
    },
    smallScreen: function() {
      return this.iPhone() || this.mobile();
    },
    tablet: function() {
      return this.iPad() || (!_is_mobile(this.ua) && _is_Android(this.ua));
    },
    Windows: function() {
      return _is_windows(this.platform);
    },
    Mac: function() {
      return _is_mac(this.platform);
    }
  });
  
  return Browser;
});
