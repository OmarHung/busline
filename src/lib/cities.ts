export interface City {
  /** TDX 縣市代碼，也是 RouteUID 的前綴 */
  code: string;
  name: string;
  /** TDX API 路徑片段，如 City/Taipei、InterCity */
  tdxPath: string;
}

const cityBus = (code: string, name: string, tdxCity: string): City => ({
  code,
  name,
  tdxPath: `City/${tdxCity}`,
});

/** 搜尋結果的縣市排序也依此順序 */
export const CITIES: readonly City[] = [
  cityBus("TPE", "臺北市", "Taipei"),
  cityBus("NWT", "新北市", "NewTaipei"),
  cityBus("KEE", "基隆市", "Keelung"),
  cityBus("TAO", "桃園市", "Taoyuan"),
  cityBus("HSZ", "新竹市", "Hsinchu"),
  cityBus("HSQ", "新竹縣", "HsinchuCounty"),
  cityBus("MIA", "苗栗縣", "MiaoliCounty"),
  cityBus("TXG", "臺中市", "Taichung"),
  cityBus("CHA", "彰化縣", "ChanghuaCounty"),
  cityBus("NAN", "南投縣", "NantouCounty"),
  cityBus("YUN", "雲林縣", "YunlinCounty"),
  cityBus("CYI", "嘉義市", "Chiayi"),
  cityBus("CYQ", "嘉義縣", "ChiayiCounty"),
  cityBus("TNN", "臺南市", "Tainan"),
  cityBus("KHH", "高雄市", "Kaohsiung"),
  cityBus("PIF", "屏東縣", "PingtungCounty"),
  cityBus("ILA", "宜蘭縣", "YilanCounty"),
  cityBus("HUA", "花蓮縣", "HualienCounty"),
  cityBus("TTT", "臺東縣", "TaitungCounty"),
  cityBus("PEN", "澎湖縣", "PenghuCounty"),
  cityBus("KIN", "金門縣", "KinmenCounty"),
  cityBus("LIE", "連江縣", "LienchiangCounty"),
  { code: "THB", name: "公路客運", tdxPath: "InterCity" },
];

const BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

const ROUTE_UID_PATTERN = /^[A-Z]{3}[0-9A-Za-z]{1,20}$/;

export function cityByCode(code: string): City | undefined {
  return BY_CODE.get(code);
}

export function cityFromRouteUid(uid: string): City | undefined {
  return BY_CODE.get(uid.slice(0, 3));
}

export function isValidRouteUid(uid: string): boolean {
  return ROUTE_UID_PATTERN.test(uid) && cityFromRouteUid(uid) !== undefined;
}
