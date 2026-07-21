export interface PackageDetailItem {
  name: string;
  quantity: string;
}

export interface PackageDetailSection {
  title: string;
  selectionRule?: string;
  items: PackageDetailItem[];
}

export interface PackageDetail {
  packageId: string;
  packageTitle: string;
  sections: PackageDetailSection[];
  rawHtml?: string;
  fetchedAt: Date;
  /** 从表单提取的商家坐标 */
  merchantLat?: number;
  merchantLng?: number;
}

export interface ParsedDetail {
  packageTitle: string;
  sections: PackageDetailSection[];
}
