import { Card, Col, ProgressBar, Row } from "react-bootstrap";

interface StatsCardProps {
  totalCaffeine: number;
  totalSugar: number;
}

/**
 * StatsCard Component
 * Displays progress bars for daily caffeine and sugar intake against recommended limits.
 *
 * @param totalCaffeine - Total caffeine consumed today (mg)
 * @param totalSugar - Total sugar consumed today (g)
 */
export function StatsCard({ totalCaffeine, totalSugar }: StatsCardProps) {
  // Caffeine Thresholds
  const maxSafeCaffeine = 400;
  const caffeineVariant =
    totalCaffeine > maxSafeCaffeine
      ? "danger"
      : totalCaffeine > 200
      ? "warning"
      : "success";

  // Sugar Thresholds (WHO: <25g ideal, <50g limit)
  const maxSafeSugar = 50;
  const sugarVariant =
    totalSugar > maxSafeSugar
      ? "danger"
      : totalSugar > 25
      ? "warning"
      : "success";

  return (
    <Row className="g-3 mb-4">
      {/* Caffeine Card */}
      <Col xs={12} md={6}>
        <Card className="h-100 shadow-sm border-0 bg-light">
          <Card.Body>
            <h6 className="text-muted text-uppercase mb-2">Caffeine</h6>
            <div className="d-flex align-items-baseline gap-1">
              <h2 className="display-6 fw-bold text-dark mb-0">
                {totalCaffeine}
              </h2>
              <span className="text-muted">mg</span>
            </div>
            <ProgressBar
              now={(totalCaffeine / maxSafeCaffeine) * 100}
              variant={caffeineVariant}
              className="mt-2"
              style={{ height: "6px" }}
            />
            <div className="small text-muted mt-1">Max: 400mg</div>
          </Card.Body>
        </Card>
      </Col>

      {/* Sugar Card */}
      <Col xs={12} md={6}>
        <Card className="h-100 shadow-sm border-0 bg-light">
          <Card.Body>
            <h6 className="text-muted text-uppercase mb-2">Sugar</h6>
            <div className="d-flex align-items-baseline gap-1">
              <h2 className="display-6 fw-bold text-dark mb-0">{totalSugar}</h2>
              <span className="text-muted">g</span>
            </div>
            <ProgressBar
              now={(totalSugar / maxSafeSugar) * 100}
              variant={sugarVariant}
              className="mt-2"
              style={{ height: "6px" }}
            />
            <div className="small text-muted mt-1">Goal: &lt;25g</div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
