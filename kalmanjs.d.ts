declare module 'kalmanjs' {
    class KalmanFilter {
      constructor(options: { R: number; Q: number; A?: number; B?: number; C?: number });
      filter(z: number, u?: number): number;
      predict(u?: number): number;
    }
    
    export default KalmanFilter;
  }
