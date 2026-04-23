"use client";

import { CalendarWidget } from "./CalendarWidget";
import { TaskManager } from "./TaskManager";
import { NotesPanel } from "./NotesPanel";
import { FoodOrdersWidget } from "./FoodOrdersWidget";
import { DashboardHeader } from "./DashboardHeader";
import { InboxScout } from "./InboxScout";

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

      <style jsx>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: auto 450px;
          grid-template-areas: 
            "calendar calendar tasks"
            "notes food tasks";
          gap: 2rem;
          padding: 1rem 0;
        }

        .bento-item {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }

        .calendar-area { grid-area: calendar; }
        .tasks-area { grid-area: tasks; }
        .notes-area { grid-area: notes; }
        .food-area { grid-area: food; }

        @media (max-width: 1200px) {
          .bento-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-template-areas: 
              "header header"
              "calendar calendar"
              "tasks notes"
              "tasks food";
          }
        }

        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-template-areas: 
              "header"
              "calendar"
              "tasks"
              "notes"
              "food";
          }
        }
      `}</style>
    </div>
  );
}
