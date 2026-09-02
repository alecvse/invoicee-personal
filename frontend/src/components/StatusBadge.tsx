import { useState } from "react";
import type { InvoiceStatusDisplay } from "../api/types";
import { formatPaidAtTooltip, formatStatusLabel } from "../utils/format";

type StatusBadgeProps = {
  status: InvoiceStatusDisplay;
  paidAt?: string | null;
};

type TooltipPosition = {
  x: number;
  y: number;
};

export function StatusBadge({ status, paidAt }: StatusBadgeProps) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const statusTooltip = status === "paid" ? formatPaidAtTooltip(paidAt ?? null) : null;

  function showTooltip(target: HTMLElement) {
    if (!statusTooltip) {
      return;
    }

    const rect = target.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  }

  function hideTooltip() {
    setTooltipPosition(null);
  }

  return (
    <span className="relative inline-flex">
      <span
        className={`status-badge status-${status}`}
        tabIndex={statusTooltip ? 0 : undefined}
        onMouseEnter={(e) => showTooltip(e.currentTarget)}
        onFocus={(e) => showTooltip(e.currentTarget)}
        onMouseLeave={hideTooltip}
        onBlur={hideTooltip}
      >
        {formatStatusLabel(status)}
      </span>
      {statusTooltip && tooltipPosition ? (
        <div
          className="summary-chart-tooltip"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`
          }}
        >
          <div className="summary-chart-tooltip-value">{statusTooltip}</div>
        </div>
      ) : null}
    </span>
  );
}
