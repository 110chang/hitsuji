/*
*
*   App/Configuration
*
*   @author Yuji Ito @110chang
*
*/

define([], function() {
  return {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
    SCALE: 1,

    devOptions: {
      enableSleeping: true,
      render: {
        options: {
          wireframes: true,
          //background: '#39F',
          showSleeping: true,
          showAngleIndicator: true,
          showVelocity: true,
          showCollisions: true,
          //showIds: true
        }
      }
    },
    prodOptions: {
      enableSleeping: true,
      render: {
        options: {
          wireframes: false,
          background: '#39F',
          showSleeping: false
        }
      }
    }
  };
});
