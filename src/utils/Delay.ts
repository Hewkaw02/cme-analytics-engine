/**
 * Sleep for a random amount of time between min and max milliseconds.
 * @param min Minimum delay in ms
 * @param max Maximum delay in ms
 */
export async function humanDelay(min = 1500, max = 2500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
