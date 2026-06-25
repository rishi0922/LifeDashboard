"use client";

import { CalendarWidget } from "./CalendarWidget";
import { TaskManager } from "./TaskManager";
import { NotesPanel } from "./NotesPanel";
import { FoodOrdersWidget } from "./FoodOrdersWidget";
import { NewsWidget } from "./NewsWidget";

export function DashboardGrid() {
  return (
    <div className="bento-grid">
      <div className="bento-item calendar-area">
        <CalendarWidget />
      </div>
      <div className="bento-item tasks-area">
        <TaskManager />
      </div>
      <div className="bento-item notes-area">
        <NotesPanel />
      </div>
      <div className="bento-item food-area">
        <FoodOrdersWidget />
      </div>
      <div className="bento-item news-area">
        <NewsWidget />
      </div>

      <style jsx>{`
        /* Explicit row heights make the layout deterministic. The tall
           Priorities column spans rows 1+2, so its height is fixed by
           (row1 + gap + row2) and it scrolls internally — instead of
           growing with content and inflating the rows, which used to
           leave big gaps under the shorter Timeline / Smart Brain / Food
           panels. */
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: 475px 350px auto;
          grid-template-areas:
            "calendar calendar tasks"
            "notes food tasks"
            "news news news";
          gap: 2rem;
          padding: 1rem 0;
        }

        .bento-item {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0; /* lets inner lists scroll instead of stretching */
        }

        .calendar-area { grid-area: calendar; }
        .tasks-area { grid-area: tasks; }
        .notes-area { grid-area: notes; }
        .food-area { grid-area: food; }
        .news-area { grid-area: news; }

        @media (max-width: 1200px) {
          .bento-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-template-rows: 475px 350px 350px auto;
            grid-template-areas:
              "calendar calendar"
              "tasks notes"
              "tasks food"
              "news news";
          }
        }

        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 475px 520px 350px 320px auto;
            grid-template-areas:
              "calendar"
              "tasks"
              "notes"
              "food"
              "news";
          }
        }
      `}</style>
    </div>
  );
}

