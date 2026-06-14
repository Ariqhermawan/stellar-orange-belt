import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "./Progress";

describe("<Progress />", () => {
  it("renders the percentage label", () => {
    render(<Progress raised={50} goal={200} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("exposes an accessible progress value", () => {
    render(<Progress raised={100} goal={200} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });
});
