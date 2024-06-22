declare module 'kalmanjs' {
    class KalmanFilter {
      constructor(options: { R: number; Q: number });
      filter(z: number): { x: number; k: number; P: number; };
      predict(u?: number): { x: number; P: number; };
    }
    
    export default KalmanFilter;
  }
  