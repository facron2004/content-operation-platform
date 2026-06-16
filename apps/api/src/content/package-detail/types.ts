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
}

export interface ParsedDetail {
  packageTitle: string;
  sections: PackageDetailSection[];
}
