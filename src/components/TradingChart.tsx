import React from "react";
import {
  CandlestickSeries,
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type TickMarkType,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import type { DashboardState, Side } from "../types/trading";
import { lineData } from "../utils/indicators";

interface TradingChartProps {
  state: DashboardState;
}

interface TradeOverlay {
  side: Side;
  left: number;
  width: number;
  entryY: number;
  tpTop: number;
  tpHeight: number;
  slTop: number;
  slHeight: number;
  takeProfit: number;
  stopLoss: number;
  riskReward: number | null;
}

export function TradingChart({ state }: TradingChartProps) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stateRef = React.useRef(state);
  const chartRef = React.useRef<IChartApi | null>(null);
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema50Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const supportRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const resistanceRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const tpLineRef = React.useRef<IPriceLine | null>(null);
  const slLineRef = React.useRef<IPriceLine | null>(null);
  const initializedRangeRef = React.useRef(false);
  const [tradeOverlay, setTradeOverlay] = React.useState<TradeOverlay | null>(null);
  stateRef.current = state;

  React.useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#101419" },
        textColor: "#b8c0cc"
      },
      grid: {
        vertLines: { color: "#1c2430" },
        horzLines: { color: "#1c2430" }
      },
      rightPriceScale: {
        borderColor: "#2b3542",
        scaleMargins: {
          top: 0.08,
          bottom: 0.08
        }
      },
      timeScale: {
        borderColor: "#2b3542",
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
        minBarSpacing: 5,
        rightOffset: 8,
        tickMarkFormatter: formatChartTick
      },
      localization: {
        timeFormatter: formatChartTime
      },
      crosshair: { mode: CrosshairMode.Normal },
      width: containerRef.current.clientWidth,
      height: 640
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#21c38b",
      downColor: "#ef5b5b",
      borderVisible: true,
      borderUpColor: "#21c38b",
      borderDownColor: "#ef5b5b",
      wickUpColor: "#21c38b",
      wickDownColor: "#ef5b5b"
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: "#f4c542",
      lineWidth: 2,
      title: "EMA50",
      priceLineVisible: false
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: "#4aa3ff",
      lineWidth: 2,
      title: "EMA200",
      priceLineVisible: false
    });
    supportRef.current = chart.addSeries(LineSeries, {
      color: "#2fd18b",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "Support",
      priceLineVisible: false
    });
    resistanceRef.current = chart.addSeries(LineSeries, {
      color: "#ff7a7a",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "Resistance",
      priceLineVisible: false
    });

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: entry.contentRect.width });
      requestAnimationFrame(() => {
        setTradeOverlay(calculateTradeOverlay(stateRef.current, chart, candleSeriesRef.current, wrapperRef.current));
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const chartCandles = state.candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));
    candleSeriesRef.current?.setData(chartCandles);
    const timeScale = chartRef.current?.timeScale();
    if (chartCandles.length > 0 && !initializedRangeRef.current) {
      const to = chartCandles.length + 6;
      timeScale?.setVisibleLogicalRange({
        from: Math.max(0, chartCandles.length - 90),
        to
      });
      initializedRangeRef.current = true;
    } else if (timeScale && timeScale.scrollPosition() < 2) {
      timeScale.scrollToRealTime();
    }
    ema50Ref.current?.setData(lineData(state.candles, 50));
    ema200Ref.current?.setData(lineData(state.candles, 200));

    supportRef.current?.setData(
      state.indicators.support && state.indicators.supportTime
        ? structureLineFromSource(state.candles, state.indicators.support, state.indicators.supportTime)
        : []
    );
    resistanceRef.current?.setData(
      state.indicators.resistance && state.indicators.resistanceTime
        ? structureLineFromSource(state.candles, state.indicators.resistance, state.indicators.resistanceTime)
        : []
    );

    const tradeLevels = state.openPosition ?? state.signal.proposedTrade ?? null;
    requestAnimationFrame(() => {
      setTradeOverlay(calculateTradeOverlay(state, chartRef.current, candleSeriesRef.current, wrapperRef.current));
    });

    syncPriceLine(candleSeriesRef.current, tpLineRef, tradeLevels?.takeProfit ?? null, {
      id: "take-profit",
      title: "TP",
      color: "#24d18c",
      axisLabelColor: "#24d18c",
      axisLabelTextColor: "#07130d"
    });
    syncPriceLine(candleSeriesRef.current, slLineRef, tradeLevels?.stopLoss ?? null, {
      id: "stop-loss",
      title: "SL",
      color: "#ff4d61",
      axisLabelColor: "#ff4d61",
      axisLabelTextColor: "#1f070a"
    });
  }, [state]);

  return (
    <div className="chart" ref={wrapperRef}>
      <div className="chart-canvas" ref={containerRef} />
      {tradeOverlay ? <TradeBox overlay={tradeOverlay} /> : null}
    </div>
  );
}

function alignToMinute(timestamp: number) {
  return Math.floor(timestamp / 60) * 60;
}

function structureLineFromSource(candles: DashboardState["candles"], price: number, sourceTime: number) {
  if (candles.length === 0) return [];

  const end = candles[candles.length - 1];
  const startTime = alignToMinute(sourceTime);
  const endTime = Math.max(alignToMinute(end.time), startTime + 60);

  return [
    { time: startTime as UTCTimestamp, value: price },
    { time: endTime as UTCTimestamp, value: price }
  ];
}

function calculateTradeOverlay(
  state: DashboardState,
  chart: IChartApi | null,
  series: ISeriesApi<"Candlestick"> | null,
  container: HTMLDivElement | null
): TradeOverlay | null {
  if (!chart || !series || !container) return null;

  const activeTrade = state.openPosition;
  const proposedTrade = activeTrade ? null : state.signal.proposedTrade;
  const levels = activeTrade ?? proposedTrade;
  if (!levels) return null;

  const startTime = alignToMinute(activeTrade?.openedAt ?? state.candles.at(-1)?.time ?? 0) as UTCTimestamp;
  const startX = chart.timeScale().timeToCoordinate(startTime);
  const entryY = series.priceToCoordinate(levels.entry);
  const tpY = series.priceToCoordinate(levels.takeProfit);
  const slY = series.priceToCoordinate(levels.stopLoss);
  if (startX === null || entryY === null || tpY === null || slY === null) return null;

  const left = Math.max(0, startX);
  const rightPadding = 108;
  const latestTime = alignToMinute(state.candles.at(-1)?.time ?? startTime) as UTCTimestamp;
  const latestX = chart.timeScale().timeToCoordinate(latestTime);
  const right = clamp((latestX ?? container.clientWidth - rightPadding) + 18, left + 120, container.clientWidth - rightPadding);
  const width = right - left;
  const chartBottom = container.clientHeight - 52;
  const tpTop = clamp(Math.min(tpY, entryY), 8, chartBottom);
  const slTop = clamp(Math.min(slY, entryY), 8, chartBottom);
  const clampedEntryY = clamp(entryY, 8, chartBottom);
  const risk = Math.abs(levels.entry - levels.stopLoss);
  const reward = Math.abs(levels.takeProfit - levels.entry);

  return {
    side: levels.side,
    left,
    width,
    entryY: clampedEntryY,
    tpTop,
    tpHeight: clamp(Math.abs(entryY - tpY), 8, chartBottom - tpTop),
    slTop,
    slHeight: clamp(Math.abs(entryY - slY), 8, chartBottom - slTop),
    takeProfit: levels.takeProfit,
    stopLoss: levels.stopLoss,
    riskReward: risk > 0 ? reward / risk : null
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function TradeBox({ overlay }: { overlay: TradeOverlay }) {
  return (
    <div className="trade-overlay" style={{ left: overlay.left, width: overlay.width }}>
      <div className="trade-zone trade-zone-tp" style={{ top: overlay.tpTop, height: overlay.tpHeight }}>
        <span>TP ${overlay.takeProfit.toFixed(2)}</span>
      </div>
      <div className="trade-entry-line" style={{ top: overlay.entryY }} />
      <div className="trade-zone trade-zone-sl" style={{ top: overlay.slTop, height: overlay.slHeight }}>
        <span>SL ${overlay.stopLoss.toFixed(2)}{overlay.riskReward ? ` · R:R ${overlay.riskReward.toFixed(2)}` : ""}</span>
      </div>
    </div>
  );
}

function syncPriceLine(
  series: ISeriesApi<"Candlestick"> | null,
  ref: React.MutableRefObject<IPriceLine | null>,
  price: number | null,
  options: {
    id: string;
    title: string;
    color: string;
    axisLabelColor: string;
    axisLabelTextColor: string;
  }
) {
  if (!series) return;

  if (price === null) {
    if (ref.current) {
      series.removePriceLine(ref.current);
      ref.current = null;
    }
    return;
  }

  const priceLineOptions = {
    id: options.id,
    price,
    title: `${options.title} ${price.toFixed(2)}`,
    color: options.color,
    lineWidth: 2 as const,
    lineStyle: LineStyle.Dashed,
    lineVisible: true,
    axisLabelVisible: true,
    axisLabelColor: options.axisLabelColor,
    axisLabelTextColor: options.axisLabelTextColor
  };

  if (ref.current) {
    ref.current.applyOptions(priceLineOptions);
  } else {
    ref.current = series.createPriceLine(priceLineOptions);
  }
}

function formatChartTime(time: Time): string {
  const timestamp = toTimestamp(time);
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp * 1000));
}

function formatChartTick(time: Time, tickMarkType: TickMarkType): string {
  const timestamp = toTimestamp(time);
  if (!timestamp) return "";

  const date = new Date(timestamp * 1000);
  const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit"
  });
  const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit"
  });

  return tickMarkType <= 2 ? dayFormatter.format(date) : timeFormatter.format(date);
}

function toTimestamp(time: Time): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Math.floor(Date.parse(`${time}T00:00:00Z`) / 1000);
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}
