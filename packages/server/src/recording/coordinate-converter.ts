export class CoordinateConverter {
  constructor(
    private inputMaxX: number,
    private inputMaxY: number,
    private screenWidth: number,
    private screenHeight: number,
  ) {}

  toPixelX(rawX: number): number {
    return Math.floor((rawX * this.screenWidth) / this.inputMaxX);
  }

  toPixelY(rawY: number): number {
    return Math.floor((rawY * this.screenHeight) / this.inputMaxY);
  }

  /** Convert tap distance threshold from pixels to raw sensor units */
  pixelsToRawDistance(pixels: number): number {
    return Math.floor((pixels * this.inputMaxX) / this.screenWidth);
  }
}
