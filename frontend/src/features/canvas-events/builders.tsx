import { CanvasEventBuilder } from "./CanvasEventBuilder";
import {
  banBuilderConfig,
  boostBuilderConfig,
  leaveBuilderConfig,
} from "./configs";

export function LeaveBuilder() {
  return <CanvasEventBuilder config={leaveBuilderConfig} />;
}

export function BanBuilder() {
  return <CanvasEventBuilder config={banBuilderConfig} />;
}

export function BoostBuilder() {
  return <CanvasEventBuilder config={boostBuilderConfig} />;
}
