import { z } from "zod";

// 只宣告用得到的欄位；其餘欄位在 parse 時會被丟掉，回傳給前端的資料也比較小

const NameSchema = z.object({ Zh_tw: z.string().optional(), En: z.string().optional() });

const PositionSchema = z.object({ PositionLon: z.number(), PositionLat: z.number() });

export const RouteSchema = z.object({
  RouteUID: z.string(),
  RouteName: NameSchema,
  DepartureStopNameZh: z.string().optional(),
  DestinationStopNameZh: z.string().optional(),
});
export type TdxRoute = z.infer<typeof RouteSchema>;

export const ShapeSchema = z.object({
  RouteUID: z.string(),
  SubRouteUID: z.string().optional(),
  Direction: z.number().optional(),
  Geometry: z.string().optional(),
});
export type TdxShape = z.infer<typeof ShapeSchema>;

export const StopOfRouteSchema = z.object({
  RouteUID: z.string(),
  SubRouteUID: z.string().optional(),
  Direction: z.number().optional(),
  Stops: z.array(
    z.object({
      StopUID: z.string(),
      StopName: NameSchema,
      StopSequence: z.number(),
      StopPosition: PositionSchema,
    }),
  ),
});
export type TdxStopOfRoute = z.infer<typeof StopOfRouteSchema>;

export const EtaSchema = z.object({
  StopUID: z.string(),
  RouteUID: z.string(),
  Direction: z.number().optional(),
  EstimateTime: z.number().optional(),
  StopStatus: z.number().optional(),
  NextBusTime: z.string().optional(),
  IsLastBus: z.boolean().optional(),
});
export type TdxEta = z.infer<typeof EtaSchema>;

export const BusSchema = z.object({
  PlateNumb: z.string(),
  RouteUID: z.string().optional(),
  Direction: z.number().optional(),
  BusPosition: PositionSchema,
  Azimuth: z.number().optional(),
  Speed: z.number().optional(),
  DutyStatus: z.number().optional(),
  GPSTime: z.string().optional(),
});
export type TdxBus = z.infer<typeof BusSchema>;
